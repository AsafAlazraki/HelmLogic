'use client';

/**
 * v1.34 — Yamaha Rebates manager (replaces ModulePromotions on motor
 * modules; Asaf: "rename promotions to Yamaha rebates").
 *
 * MPF-grounded design (see src/lib/rebates.ts): a rebate = named
 * program + optional promo photo + selected SKUs each given a
 * TEMPORARY NEW PRICE (exactly the MPF's Rebate Program / Rebate
 * Discount / campaign Sell Price mechanism). While active, every
 * selected MPF motor row is stamped so all pricing surfaces see it;
 * on end (manual or the endsAt timer) stamps are removed and the
 * rebate moves to Past Rebates, where its sales history (who bought
 * which motor on which quote) stays browsable forever.
 */

import { useEffect, useMemo, useState } from 'react';
import {
    addDoc, collection, deleteField, doc, getDocs, orderBy, query,
    serverTimestamp, updateDoc, arrayUnion,
} from 'firebase/firestore';
import Link from 'next/link';
import { useFirestore, useMemoFirebase, useStorage } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useCollection } from '@/firebase/firestore/use-collection';
import { uploadFileToStorage } from '@/firebase/storage';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import {
    BadgePercent, Plus, Pencil, Loader2, Search, X, History, Power,
    ShoppingCart, ScrollText, CalendarClock, ExternalLink,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency-utils';
import {
    Rebate, RebateSku, RebateSale, rebateEndsAtExpired, getActiveRebate,
} from '@/lib/rebates';

interface YamahaRebatesProps {
    moduleId: string;
    vendorId: string;
    organisationId: string;
    vendorName?: string;
}

interface MotorRowLite {
    id: string;
    code: string;
    model: string;
    hp?: string | number | null;
    retail: number | null;
    activeRebate?: any;
}

const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function YamahaRebates({ moduleId, vendorId, organisationId, vendorName }: YamahaRebatesProps) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { user } = useUser();
    const userName = user?.displayName || user?.email || 'Unknown';
    const userId = user?.uid || '';

    const brandLabel = vendorName || 'Yamaha';

    // Rebates live under data-warehouse/{vendorId} — WITH the MPF catalog
    // they discount, and inside the existing recursive data-warehouse
    // rules wildcard (no rules deploy needed).
    const rebatesRef = useMemoFirebase(
        () => query(collection(firestore, 'data-warehouse', vendorId, 'rebates'), orderBy('createdAt', 'desc')),
        [firestore, vendorId],
    );
    const { data: rebates, isLoading } = useCollection<Rebate>(rebatesRef);

    // ── MPF motor rows (the SKU universe) — same dataset discovery as the
    //    quote flow / motors table, loaded once. ──
    const [rows, setRows] = useState<MotorRowLite[]>([]);
    const [dataSetId, setDataSetId] = useState<string | null>(null);
    const [rowsLoading, setRowsLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const dsSnap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'dataSets'));
                if (cancelled) return;
                const datasets = dsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                const preferred = datasets.find((s: any) =>
                    String(s.name || '').toLowerCase().match(/outboard|motor|library|engine/)) || datasets[0];
                if (!preferred) { setRows([]); return; }
                setDataSetId(preferred.id);
                const rowsSnap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'dataSets', preferred.id, 'rows'));
                if (cancelled) return;
                const list: MotorRowLite[] = [];
                rowsSnap.forEach(d => {
                    const r: any = d.data();
                    const code = r['Part Number'] ?? r['MODEL CODE'];
                    if (!code) return; // MPF section pseudo-rows
                    list.push({
                        id: d.id,
                        code: String(code),
                        model: String(r['Model Name'] ?? r['MODEL'] ?? code),
                        hp: r['HP Rating'] ?? null,
                        retail: num(r.priceLevels?.hull_cash) ?? num(r['NSM Retail']) ?? num(r.sellPriceExclGst),
                        activeRebate: r.activeRebate,
                    });
                });
                list.sort((a, b) => a.code.localeCompare(b.code));
                setRows(list);
            } catch (err) {
                console.error('Failed to load motor rows for rebates', err);
            } finally {
                if (!cancelled) setRowsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [firestore, vendorId]);

    const rowPath = (rowId: string) =>
        doc(firestore, 'data-warehouse', vendorId, 'dataSets', dataSetId!, 'rows', rowId);

    /** Stamp the MPF rows for an active rebate (the MPF's own col Y / col Z
     *  columns ride along so exports and audits read like NSM's file). */
    async function stampRows(rebateId: string, rebate: Pick<Rebate, 'name' | 'imageUrl' | 'linkUrl' | 'startsAt' | 'endsAt'>, skus: RebateSku[]) {
        for (const s of skus) {
            await updateDoc(rowPath(s.rowId), {
                activeRebate: {
                    rebateId,
                    vendorId,
                    name: rebate.name,
                    imageUrl: rebate.imageUrl ?? null,
                    linkUrl: rebate.linkUrl ?? null,
                    retailPrice: s.retailPrice,
                    rebatePrice: s.rebatePrice,
                    startsAt: rebate.startsAt ?? null,
                    endsAt: rebate.endsAt ?? null,
                },
                'Rebate Program': rebate.name,
                'Rebate Discount': Math.max(0, s.retailPrice - s.rebatePrice),
                updatedAt: serverTimestamp(),
            });
        }
    }

    async function unstampRows(rowIds: string[]) {
        for (const rowId of rowIds) {
            await updateDoc(rowPath(rowId), {
                activeRebate: deleteField(),
                'Rebate Program': deleteField(),
                'Rebate Discount': deleteField(),
                updatedAt: serverTimestamp(),
            });
        }
    }

    const logEntry = (action: string, note?: string) => ({
        action,
        by: userName,
        at: new Date().toISOString(),
        ...(note ? { note } : {}),
    });

    /** End a rebate (manual button or expiry sweep): remove every row
     *  stamp, flip to past, audit it. */
    const [endingId, setEndingId] = useState<string | null>(null);
    async function endRebate(rebate: Rebate, reason: 'manual' | 'expired') {
        setEndingId(rebate.id);
        try {
            if (dataSetId) await unstampRows((rebate.skus ?? []).map(s => s.rowId));
            await updateDoc(doc(firestore, 'data-warehouse', vendorId, 'rebates', rebate.id), {
                status: 'past',
                endedAt: serverTimestamp(),
                endedBy: reason === 'manual' ? userName : 'timer',
                endedReason: reason,
                updatedAt: serverTimestamp(),
                changeLog: arrayUnion(logEntry(
                    reason === 'manual' ? 'ended-manually' : 'ended-by-timer',
                    `${(rebate.skus ?? []).length} SKU price${(rebate.skus ?? []).length === 1 ? '' : 's'} restored to retail`,
                )),
            });
            if (reason === 'manual') toast({ title: 'Rebate ended', description: 'SKU prices are back to retail. Find it under Past Rebates.' });
        } catch (err: any) {
            console.error('Failed to end rebate', err);
            toast({ variant: 'destructive', title: 'Failed to end rebate', description: err?.message ?? String(err) });
        } finally {
            setEndingId(null);
        }
    }

    // ── Expiry sweep (the auto-off timer). Runs once per mount after both
    //    rebates and the dataset resolve; fire-and-forget. Readers are
    //    already guarded by getActiveRebate, so this is cleanup, not the
    //    safety mechanism. ──
    const [sweptOnce, setSweptOnce] = useState(false);
    useEffect(() => {
        if (sweptOnce || !rebates || !dataSetId) return;
        const expired = rebates.filter(r => r.status === 'active' && rebateEndsAtExpired(r.endsAt));
        if (expired.length === 0) { setSweptOnce(true); return; }
        setSweptOnce(true);
        (async () => {
            for (const r of expired) await endRebate(r, 'expired');
            toast({ title: `${expired.length} rebate${expired.length === 1 ? '' : 's'} auto-ended`, description: 'Timer reached — prices restored, moved to Past Rebates.' });
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rebates, dataSetId, sweptOnce]);

    const activeRebates = useMemo(
        () => (rebates ?? []).filter(r => r.status === 'active' && !rebateEndsAtExpired(r.endsAt)),
        [rebates],
    );
    const pastRebates = useMemo(
        () => (rebates ?? []).filter(r => r.status === 'past' || (r.status === 'active' && rebateEndsAtExpired(r.endsAt))),
        [rebates],
    );

    // ── Dialog state ──
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Rebate | null>(null);
    const [detail, setDetail] = useState<Rebate | null>(null);

    return (
        <Card className="border-2 rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                        <BadgePercent className="w-5 h-5 text-red-600" />
                        {brandLabel} Rebates
                    </CardTitle>
                    <CardDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Temporary rebate prices per SKU — shown on every quote and PDF while live
                    </CardDescription>
                </div>
                <Button
                    onClick={() => { setEditing(null); setDialogOpen(true); }}
                    className="rounded-xl text-[10px] font-black uppercase bg-red-600 hover:bg-red-700"
                    size="sm"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    New Rebate
                </Button>
            </CardHeader>

            <CardContent className="space-y-6">
                {(isLoading || rowsLoading) && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {!isLoading && !rowsLoading && (
                    <>
                        {/* ── Active rebates ── */}
                        {activeRebates.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-2xl">
                                No live rebates. Create one to put temporary prices on selected motors.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {activeRebates.map(rebate => (
                                    <ActiveRebateCard
                                        key={rebate.id}
                                        rebate={rebate}
                                        ending={endingId === rebate.id}
                                        onEdit={() => { setEditing(rebate); setDialogOpen(true); }}
                                        onEnd={() => endRebate(rebate, 'manual')}
                                        onDetail={() => setDetail(rebate)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* ── Past rebates ── */}
                        <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                <History className="w-3.5 h-3.5" /> Past Rebates
                            </p>
                            {pastRebates.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">Nothing here yet — ended rebates land here with their full sales history.</p>
                            ) : (
                                <div className="rounded-xl border-2 divide-y">
                                    {pastRebates.map(rebate => (
                                        <button
                                            key={rebate.id}
                                            onClick={() => setDetail(rebate)}
                                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
                                        >
                                            {rebate.imageUrl ? (
                                                <img src={rebate.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-slate-100 border flex items-center justify-center">
                                                    <BadgePercent className="w-4 h-4 text-slate-400" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black truncate">{rebate.name}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                                    {(rebate.skus ?? []).length} SKUs
                                                    {rebate.startsAt || rebate.endsAt ? ` · ${rebate.startsAt ?? '…'} → ${rebate.endsAt ?? '…'}` : ''}
                                                    {rebate.endedReason ? ` · ended ${rebate.endedReason === 'expired' ? 'by timer' : `by ${rebate.endedBy ?? 'admin'}`}` : ''}
                                                </p>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] font-black uppercase bg-slate-100 text-slate-600">
                                                View sales
                                            </Badge>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </CardContent>

            {/* Create / edit dialog */}
            {dialogOpen && (
                <RebateDialog
                    key={editing?.id ?? 'new'}
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    editing={editing}
                    rows={rows}
                    brandLabel={brandLabel}
                    onSave={async (form, skus, uploadedImage) => {
                        const skusClean = skus.map(s => ({ ...s, rebatePrice: Math.round(s.rebatePrice * 100) / 100 }));
                        let imageUrl = editing?.imageUrl ?? null;
                        if (uploadedImage) {
                            const path = `modules/${moduleId}/rebates/${editing?.id ?? Date.now()}/image-${Date.now()}`;
                            imageUrl = await uploadFileToStorage(storage, uploadedImage, path);
                        }
                        const base = {
                            name: form.name.trim(),
                            description: form.description.trim(),
                            imageUrl,
                            linkUrl: form.linkUrl.trim() || null,
                            startsAt: form.startsAt || null,
                            endsAt: form.endsAt || null,
                            skus: skusClean,
                            showImageOnQuote: !!imageUrl,
                            updatedAt: serverTimestamp(),
                        };
                        if (editing) {
                            const removed = (editing.skus ?? []).filter(old => !skusClean.some(s => s.rowId === old.rowId));
                            const priceChanges = skusClean.filter(s => {
                                const old = (editing.skus ?? []).find(o => o.rowId === s.rowId);
                                return old && Math.abs(old.rebatePrice - s.rebatePrice) > 0.004;
                            });
                            const added = skusClean.filter(s => !(editing.skus ?? []).some(o => o.rowId === s.rowId));
                            const noteBits = [
                                added.length ? `+${added.length} SKU${added.length === 1 ? '' : 's'} (${added.map(a => a.code).join(', ')})` : '',
                                removed.length ? `-${removed.length} SKU${removed.length === 1 ? '' : 's'} (${removed.map(r => r.code).join(', ')})` : '',
                                priceChanges.length ? `${priceChanges.length} price change${priceChanges.length === 1 ? '' : 's'} (${priceChanges.map(p => `${p.code} → ${formatCurrency(p.rebatePrice)}`).join(', ')})` : '',
                            ].filter(Boolean);
                            await updateDoc(doc(firestore, 'data-warehouse', vendorId, 'rebates', editing.id), {
                                ...base,
                                changeLog: arrayUnion(logEntry('edited', noteBits.length ? noteBits.join(' · ') : 'details updated')),
                            });
                            if (editing.status === 'active' && dataSetId) {
                                if (removed.length) await unstampRows(removed.map(r => r.rowId));
                                await stampRows(editing.id, { ...base }, skusClean);
                            }
                            toast({ title: 'Rebate updated' });
                        } else {
                            const ref = await addDoc(collection(firestore, 'data-warehouse', vendorId, 'rebates'), {
                                ...base,
                                status: 'active',
                                createdByUserId: userId,
                                createdByUserName: userName,
                                createdAt: serverTimestamp(),
                                changeLog: [logEntry('created', `${skusClean.length} SKU${skusClean.length === 1 ? '' : 's'}: ${skusClean.map(s => `${s.code} ${formatCurrency(s.retailPrice)} → ${formatCurrency(s.rebatePrice)}`).join(' · ')}`)],
                            });
                            if (dataSetId) await stampRows(ref.id, { ...base }, skusClean);
                            toast({ title: 'Rebate is live', description: `${skusClean.length} motor${skusClean.length === 1 ? '' : 's'} now show the rebate price on every quote.` });
                        }
                        setDialogOpen(false);
                        setEditing(null);
                    }}
                />
            )}

            {/* Detail dialog (SKUs, sales, audit) */}
            {detail && (
                <RebateDetailDialog
                    rebate={(rebates ?? []).find(r => r.id === detail.id) ?? detail}
                    vendorId={vendorId}
                    onClose={() => setDetail(null)}
                />
            )}
        </Card>
    );
}

/* ────────────────────────── Active card ────────────────────────── */

function ActiveRebateCard({ rebate, ending, onEdit, onEnd, onDetail }: {
    rebate: Rebate;
    ending: boolean;
    onEdit: () => void;
    onEnd: () => void;
    onDetail: () => void;
}) {
    const totalSaving = (rebate.skus ?? []).reduce((acc, s) => acc + Math.max(0, s.retailPrice - s.rebatePrice), 0);
    const maxSaving = (rebate.skus ?? []).reduce((acc, s) => Math.max(acc, s.retailPrice - s.rebatePrice), 0);
    const daysLeft = rebate.endsAt
        ? Math.max(0, Math.ceil((new Date(`${rebate.endsAt}T23:59:59`).getTime() - Date.now()) / 86400000))
        : null;
    return (
        <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-white overflow-hidden">
            <div className="flex items-stretch gap-0">
                {rebate.imageUrl && (
                    <img src={rebate.imageUrl} alt="" className="w-36 object-cover border-r-2 border-red-100" />
                )}
                <div className="flex-1 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="text-base font-black uppercase tracking-tight text-red-700 flex items-center gap-2">
                                <BadgePercent className="w-4 h-4" /> {rebate.name}
                            </p>
                            {rebate.description && <p className="text-xs text-muted-foreground mt-0.5">{rebate.description}</p>}
                        </div>
                        <Badge className="bg-red-600 text-white text-[9px] font-black uppercase shrink-0">● Live</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[9px] font-black uppercase">{(rebate.skus ?? []).length} SKUs</Badge>
                        {rebate.linkUrl && (
                            <a href={rebate.linkUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                <Badge variant="outline" className="text-[9px] font-black uppercase text-red-700 border-red-300 hover:bg-red-50 flex items-center gap-1">
                                    Offer site <ExternalLink className="w-3 h-3" />
                                </Badge>
                            </a>
                        )}
                        {maxSaving > 0 && (
                            <Badge variant="outline" className="text-[9px] font-black uppercase text-red-700 border-red-300">
                                Save up to {formatCurrency(maxSaving)}
                            </Badge>
                        )}
                        {rebate.endsAt && (
                            <Badge variant="outline" className="text-[9px] font-black uppercase flex items-center gap-1">
                                <CalendarClock className="w-3 h-3" />
                                Auto-ends {rebate.endsAt}{daysLeft != null ? ` (${daysLeft}d)` : ''}
                            </Badge>
                        )}
                    </div>
                    {/* SKU preview strip */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {(rebate.skus ?? []).slice(0, 6).map(s => (
                            <span key={s.rowId} className="text-[10px] font-mono font-bold bg-white border rounded-lg px-2 py-1">
                                {s.code} <span className="line-through text-muted-foreground">{formatCurrency(s.retailPrice)}</span>{' '}
                                <span className="text-red-700">{formatCurrency(s.rebatePrice)}</span>
                            </span>
                        ))}
                        {(rebate.skus ?? []).length > 6 && (
                            <span className="text-[10px] text-muted-foreground font-bold">+{(rebate.skus ?? []).length - 6} more</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <Button variant="outline" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={onEdit}>
                            <Pencil className="w-3 h-3 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={onDetail}>
                            <ShoppingCart className="w-3 h-3 mr-1" /> Sales & audit
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-[10px] font-black uppercase text-red-700 hover:text-red-700 border-red-300 ml-auto"
                            onClick={onEnd}
                            disabled={ending}
                        >
                            {ending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Power className="w-3 h-3 mr-1" />}
                            End now
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────── Create / edit dialog ────────────────────────── */

function RebateDialog({ open, onOpenChange, editing, rows, brandLabel, onSave }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    editing: Rebate | null;
    rows: MotorRowLite[];
    brandLabel: string;
    onSave: (
        form: { name: string; description: string; linkUrl: string; startsAt: string; endsAt: string },
        skus: RebateSku[],
        uploadedImage: File | null,
    ) => Promise<void>;
}) {
    const [name, setName] = useState(editing?.name ?? '');
    const [description, setDescription] = useState(editing?.description ?? '');
    const [linkUrl, setLinkUrl] = useState(editing?.linkUrl ?? '');
    const [startsAt, setStartsAt] = useState(editing?.startsAt ?? '');
    const [endsAt, setEndsAt] = useState(editing?.endsAt ?? '');
    const [skus, setSkus] = useState<RebateSku[]>(editing?.skus ?? []);
    const [skuSearch, setSkuSearch] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(editing?.imageUrl ?? null);
    const [pctOff, setPctOff] = useState('');
    const [saving, setSaving] = useState(false);

    const results = useMemo(() => {
        const q = skuSearch.trim().toLowerCase();
        if (!q) return [];
        return rows
            .filter(r => !skus.some(s => s.rowId === r.id))
            .filter(r =>
                r.code.toLowerCase().includes(q) ||
                r.model.toLowerCase().includes(q) ||
                String(r.hp ?? '').toLowerCase().includes(q))
            .slice(0, 8);
    }, [skuSearch, rows, skus]);

    const addSku = (r: MotorRowLite) => {
        if (r.retail == null) {
            toast({ variant: 'destructive', title: 'No retail price', description: `${r.code} has no NSM Retail — set one in the catalogue first.` });
            return;
        }
        // A SKU can only ride one rebate at a time — the stamp is singular
        // by design (matches the MPF's one Rebate Program column).
        const other = getActiveRebate(r);
        if (other && other.rebateId !== editing?.id) {
            toast({ variant: 'destructive', title: 'Already on a rebate', description: `${r.code} is on "${other.name}" — end that first or remove it there.` });
            return;
        }
        setSkus(prev => [...prev, {
            rowId: r.id, code: r.code, model: r.model, hp: r.hp ?? null,
            retailPrice: r.retail!, rebatePrice: r.retail!,
        }]);
        setSkuSearch('');
    };

    const applyPctOff = () => {
        const pct = parseFloat(pctOff);
        if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
            toast({ variant: 'destructive', title: 'Enter a % between 0 and 100' });
            return;
        }
        setSkus(prev => prev.map(s => ({ ...s, rebatePrice: Math.round(s.retailPrice * (1 - pct / 100)) })));
    };

    const canSave = name.trim().length > 0 && skus.length > 0
        && skus.every(s => Number.isFinite(s.rebatePrice) && s.rebatePrice > 0 && s.rebatePrice <= s.retailPrice);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
            <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-3xl max-h-[88vh] flex flex-col">
                <DialogHeader className="p-6 bg-red-50 border-b-2 border-red-100">
                    <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-red-700">
                        <BadgePercent className="w-5 h-5" />
                        {editing ? 'Edit Rebate' : `New ${brandLabel} Rebate`}
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-5 flex-1 overflow-y-auto">
                    {/* Name + photo */}
                    <div className="grid grid-cols-[1fr_auto] gap-4">
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rebate name</Label>
                                <Input
                                    className="rounded-xl border-2"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={`e.g. ${brandLabel} Winter Repower Rebate`}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description (shown to customers)</Label>
                                <Textarea
                                    className="rounded-xl border-2"
                                    rows={2}
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Limited-time factory rebate on selected outboards…"
                                />
                            </div>
                        </div>
                        <div className="space-y-1 w-40">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Promo photo</Label>
                            <button
                                type="button"
                                className="w-40 h-28 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden bg-slate-50 hover:bg-slate-100"
                                onClick={(e) => ((e.currentTarget.nextElementSibling as HTMLInputElement) ?? null)?.click()}
                            >
                                {imagePreview ? (
                                    <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-[10px] font-bold uppercase text-muted-foreground">+ Add photo</span>
                                )}
                            </button>
                            <input
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    setImageFile(f);
                                    const reader = new FileReader();
                                    reader.onload = () => setImagePreview(reader.result as string);
                                    reader.readAsDataURL(f);
                                    e.target.value = '';
                                }}
                            />
                        </div>
                    </div>

                    {/* Website link — shown wherever the rebate shows */}
                    <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Offer website link (optional)</Label>
                        <Input
                            className="rounded-xl border-2"
                            type="url"
                            value={linkUrl}
                            onChange={e => setLinkUrl(e.target.value)}
                            placeholder="https://www.yamaha-motor.com.au/offers/…"
                        />
                    </div>

                    {/* Timer */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Starts (optional)</Label>
                            <Input className="rounded-xl border-2" type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Auto-ends after (optional timer)</Label>
                            <Input className="rounded-xl border-2" type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
                        </div>
                    </div>

                    {/* SKU picker */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Motors on this rebate ({skus.length})
                        </Label>
                        <div className="relative">
                            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                className="rounded-xl border-2 pl-9 text-xs"
                                value={skuSearch}
                                onChange={e => setSkuSearch(e.target.value)}
                                placeholder="Search model code / name / HP to add…"
                            />
                            {results.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full rounded-xl border-2 bg-white shadow-xl overflow-hidden">
                                    {results.map(r => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-red-50 border-b last:border-b-0"
                                            onClick={() => addSku(r)}
                                        >
                                            <span className="font-mono font-bold text-xs">{r.code}</span>
                                            <span className="text-xs text-muted-foreground flex-1 truncate">{r.model}{r.hp ? ` · ${r.hp}hp` : ''}</span>
                                            <span className="text-xs font-bold tabular-nums">{r.retail != null ? formatCurrency(r.retail) : '—'}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {skus.length > 0 && (
                            <>
                                <div className="flex items-center gap-2">
                                    <Input
                                        className="rounded-lg border-2 h-8 w-24 text-xs"
                                        type="number"
                                        placeholder="% off"
                                        value={pctOff}
                                        onChange={e => setPctOff(e.target.value)}
                                    />
                                    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-black uppercase" onClick={applyPctOff}>
                                        Apply % off to all
                                    </Button>
                                    <span className="text-[10px] text-muted-foreground">or type each rebate price below</span>
                                </div>
                                <div className="rounded-xl border-2 overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 border-b-2">
                                            <tr className="text-left">
                                                <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">SKU</th>
                                                <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Retail</th>
                                                <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Rebate price</th>
                                                <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Customer saves</th>
                                                <th className="w-8" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {skus.map(s => {
                                                const save = s.retailPrice - s.rebatePrice;
                                                const bad = !Number.isFinite(s.rebatePrice) || s.rebatePrice <= 0 || s.rebatePrice > s.retailPrice;
                                                return (
                                                    <tr key={s.rowId} className="border-b last:border-b-0">
                                                        <td className="px-3 py-2">
                                                            <span className="font-mono font-bold">{s.code}</span>
                                                            <span className="text-muted-foreground ml-2">{s.model}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(s.retailPrice)}</td>
                                                        <td className="px-3 py-2 text-right">
                                                            <Input
                                                                type="number"
                                                                className={`h-8 w-28 rounded-lg border-2 text-right text-xs ml-auto ${bad ? 'border-red-400' : ''}`}
                                                                value={Number.isFinite(s.rebatePrice) ? s.rebatePrice : ''}
                                                                onChange={e => {
                                                                    const v = parseFloat(e.target.value);
                                                                    setSkus(prev => prev.map(x => x.rowId === s.rowId ? { ...x, rebatePrice: v } : x));
                                                                }}
                                                            />
                                                        </td>
                                                        <td className={`px-3 py-2 text-right tabular-nums font-bold ${save > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
                                                            {save > 0 ? `${formatCurrency(save)} (${Math.round((save / s.retailPrice) * 100)}%)` : '—'}
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <button
                                                                type="button"
                                                                className="text-muted-foreground hover:text-red-600"
                                                                onClick={() => setSkus(prev => prev.filter(x => x.rowId !== s.rowId))}
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t bg-muted/5 shrink-0 flex items-center justify-end gap-2">
                    <DialogClose asChild>
                        <Button variant="outline" className="rounded-xl text-[10px] font-black uppercase">Cancel</Button>
                    </DialogClose>
                    <Button
                        className="rounded-xl text-[10px] font-black uppercase bg-red-600 hover:bg-red-700"
                        disabled={!canSave || saving}
                        onClick={async () => {
                            setSaving(true);
                            try {
                                await onSave({ name, description, linkUrl, startsAt, endsAt }, skus, imageFile);
                            } catch (err: any) {
                                console.error('Rebate save failed', err);
                                toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
                            } finally {
                                setSaving(false);
                            }
                        }}
                    >
                        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                        {editing ? 'Save changes' : 'Go live'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ────────────────────────── Detail dialog (SKUs · sales · audit) ────────────────────────── */

function RebateDetailDialog({ rebate, vendorId, onClose }: {
    rebate: Rebate;
    vendorId: string;
    onClose: () => void;
}) {
    const firestore = useFirestore();
    const salesRef = useMemoFirebase(
        () => query(collection(firestore, 'data-warehouse', vendorId, 'rebates', rebate.id, 'sales'), orderBy('soldAt', 'desc')),
        [firestore, vendorId, rebate.id],
    );
    const { data: sales, isLoading: salesLoading } = useCollection<RebateSale & { id: string }>(salesRef);

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-3xl max-h-[88vh] flex flex-col">
                <DialogHeader className="p-6 bg-red-50 border-b-2 border-red-100">
                    <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-red-700">
                        <BadgePercent className="w-5 h-5" /> {rebate.name}
                        <Badge className={`ml-2 text-[9px] font-black uppercase ${rebate.status === 'active' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                            {rebate.status === 'active' ? '● Live' : 'Past'}
                        </Badge>
                    </DialogTitle>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {rebate.startsAt || rebate.endsAt ? `${rebate.startsAt ?? '…'} → ${rebate.endsAt ?? 'open-ended'}` : 'No timer'}
                        {rebate.endedReason ? ` · ended ${rebate.endedReason === 'expired' ? 'by timer' : `manually by ${rebate.endedBy ?? '—'}`}` : ''}
                        {rebate.createdByUserName ? ` · created by ${rebate.createdByUserName}` : ''}
                    </p>
                </DialogHeader>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {/* SKUs */}
                    <section className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rebate prices ({(rebate.skus ?? []).length} SKUs)</p>
                        <div className="rounded-xl border-2 overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b-2">
                                    <tr className="text-left">
                                        <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">SKU</th>
                                        <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Retail</th>
                                        <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Rebate price</th>
                                        <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Saving</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(rebate.skus ?? []).map(s => (
                                        <tr key={s.rowId} className="border-b last:border-b-0">
                                            <td className="px-3 py-2"><span className="font-mono font-bold">{s.code}</span> <span className="text-muted-foreground">{s.model}</span></td>
                                            <td className="px-3 py-2 text-right tabular-nums line-through text-muted-foreground">{formatCurrency(s.retailPrice)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-bold text-red-700">{formatCurrency(s.rebatePrice)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(Math.max(0, s.retailPrice - s.rebatePrice))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Sales */}
                    <section className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <ShoppingCart className="w-3.5 h-3.5" /> Sales under this rebate {sales ? `(${sales.length})` : ''}
                        </p>
                        {salesLoading ? (
                            <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                        ) : (sales ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground border-2 border-dashed rounded-xl p-4 text-center">
                                No quotes finalized with this rebate yet. Every deal written while it runs lands here automatically.
                            </p>
                        ) : (
                            <div className="rounded-xl border-2 divide-y">
                                {(sales ?? []).map(sale => (
                                    <div key={sale.id} className="p-3 flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black truncate">
                                                {sale.customerName || 'Unnamed customer'}
                                                <span className="font-mono font-bold text-xs ml-2 text-red-700">{sale.motorCode}</span>
                                            </p>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                                {new Date(sale.soldAt).toLocaleDateString()} · {sale.salespersonName || '—'}
                                                {' · '}<span className="line-through">{formatCurrency(sale.retailPrice)}</span> → {formatCurrency(sale.rebatePrice)}
                                                {sale.dealTotal ? ` · deal ${formatCurrency(sale.dealTotal)}` : ''}
                                            </p>
                                        </div>
                                        {sale.quotePath && (
                                            <Link href={sale.quotePath} className="shrink-0">
                                                <Badge variant="outline" className="text-[9px] font-black uppercase flex items-center gap-1 hover:bg-slate-50">
                                                    Open deal <ExternalLink className="w-3 h-3" />
                                                </Badge>
                                            </Link>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Audit trail */}
                    <section className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <ScrollText className="w-3.5 h-3.5" /> Audit trail
                        </p>
                        <div className="rounded-xl border-2 divide-y">
                            {[...(rebate.changeLog ?? [])].reverse().map((e, i) => (
                                <div key={i} className="p-3">
                                    <p className="text-xs font-bold">
                                        <span className="uppercase tracking-widest text-[10px] text-red-700">{e.action.replace(/-/g, ' ')}</span>
                                        <span className="text-muted-foreground font-normal ml-2">{e.by} · {new Date(e.at).toLocaleString()}</span>
                                    </p>
                                    {e.note && <p className="text-xs text-muted-foreground mt-0.5">{e.note}</p>}
                                </div>
                            ))}
                            {(rebate.changeLog ?? []).length === 0 && (
                                <p className="text-xs text-muted-foreground p-3">No entries.</p>
                            )}
                        </div>
                    </section>
                </div>

                <div className="p-4 border-t bg-muted/5 shrink-0 flex justify-end">
                    <DialogClose asChild>
                        <Button variant="outline" className="rounded-xl text-[10px] font-black uppercase">Close</Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
}
