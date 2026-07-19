
'use client';

/**
 * ServiceQuoteFlow (v1.11 — Epic 11.2.1 + 11.1.3 + 11.1.4).
 *
 * Service-quoting UI surfaced inside a new module page under
 * /modules/{id} when moduleType === 'service'. Three pieces:
 *
 *   ServiceQuoteDashboard  — list of all service quotes on the org
 *   ServiceQuoteCreate     — 4-step wizard (customer → operations →
 *                            parts → review)
 *   ServiceQuoteCard       — compact row on the dashboard
 *
 * Quotes live at `organisations/{orgId}/serviceQuotes/{quoteId}` and
 * carry { customerName, customerPhone, vehicle, operations[], parts[],
 *         status, totalSell, totalCost, createdAt, updatedAt }.
 *
 * MVP scope: create + view + status changes. PDF + send-to-customer +
 * NSM-Hub data migration arrive in v1.12+.
 */

import { useEffect, useMemo, useState } from 'react';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { ServiceQuoteDetailSheet } from '@/components/service-quote-detail-sheet';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, ChevronLeft, ChevronRight, Loader2, Wrench, Package, User, ClipboardCheck, Check, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CatalogItemPicker, type CatalogAdd } from '@/components/catalog-item-picker';

const STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'in-progress', 'complete', 'cancelled'] as const;
type ServiceQuoteStatus = typeof STATUS_OPTIONS[number];

const STATUS_TONE: Record<ServiceQuoteStatus, string> = {
    'draft': 'bg-slate-100 text-slate-700 border-slate-300',
    'sent': 'bg-sky-100 text-sky-700 border-sky-300',
    'accepted': 'bg-emerald-100 text-emerald-700 border-emerald-300',
    'in-progress': 'bg-amber-100 text-amber-700 border-amber-300',
    'complete': 'bg-violet-100 text-violet-700 border-violet-300',
    'cancelled': 'bg-rose-100 text-rose-700 border-rose-300',
};

interface ServiceOperation {
    id: string;
    code: string;
    name: string;
    flatRateHours: number;
    hourlyRate: number;
    cost?: number | null;
    sellPrice?: number | null;
}

interface ServicePart {
    id: string;
    partNumber: string;
    name: string;
    cost: number;
    sellPrice?: number | null;
}

interface ServiceQuoteLineOp {
    id: string;
    code: string;
    name: string;
    hours: number;
    rate: number;
    sellPrice: number;
    cost: number;
}

interface ServiceQuoteLinePart {
    id: string;
    partNumber: string;
    name: string;
    qty: number;
    cost: number;
    sellPrice: number;
    /** Counter-quote catalog lines — 'motor' | 'trailer' | 'dealer-fit' |
     *  'rigging-kit'. Absent on classic serviceParts lines. */
    itemType?: string;
}

interface ServiceQuote {
    id: string;
    customerName: string;
    customerPhone?: string;
    vehicle?: string;
    notes?: string | null;
    operations: ServiceQuoteLineOp[];
    parts: ServiceQuoteLinePart[];
    status: ServiceQuoteStatus;
    totalSell: number;
    totalCost: number;
    createdAt?: any;
    updatedAt?: any;
}

function deriveOpSell(op: { flatRateHours: number; hourlyRate: number; sellPrice?: number | null }) {
    return op.sellPrice != null ? op.sellPrice : Math.round(op.flatRateHours * op.hourlyRate * 100) / 100;
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

export function ServiceQuoteDashboard({ organisationId, organisation }: { organisationId: string; organisation?: any }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [createOpen, setCreateOpen] = useState(false);
    const [detailQuote, setDetailQuote] = useState<ServiceQuote | null>(null);
    const [statusFilter, setStatusFilter] = useState<ServiceQuoteStatus | 'all'>('all');
    /** Deep-link entry (module surfaces): ?newQuote=1&catalogTab=trailers
     *  auto-opens the create wizard with the catalog picker preselected.
     *  Params are stripped after consumption so a refresh doesn't re-open. */
    const [initialCatalogTab, setInitialCatalogTab] = useState<string | null>(null);
    const [initialKind, setInitialKind] = useState<string | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('newQuote') !== '1') return;
        setInitialCatalogTab(sp.get('catalogTab'));
        setInitialKind(sp.get('kind'));
        setCreateOpen(true);
        sp.delete('newQuote');
        sp.delete('catalogTab');
        sp.delete('kind');
        const qs = sp.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }, []);

    const quotesRef = useMemoFirebase(
        () => query(collection(firestore, 'organisations', organisationId, 'serviceQuotes'), orderBy('updatedAt', 'desc')),
        [firestore, organisationId],
    );
    const { data: quotes, isLoading } = useCollection<ServiceQuote>(quotesRef);

    // Keep the open detail sheet in sync with the live snapshot — detailQuote is
    // captured at click time, so without this, edits made from the sheet (status
    // changes, added schedule intervals) render stale and consecutive array
    // writes would clobber each other.
    useEffect(() => {
        if (!detailQuote || !quotes) return;
        const fresh = quotes.find(q => q.id === detailQuote.id);
        if (fresh && fresh !== detailQuote) setDetailQuote(fresh);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quotes]);

    const filtered = useMemo(() => {
        const list = quotes ?? [];
        return statusFilter === 'all' ? list : list.filter(q => q.status === statusFilter);
    }, [quotes, statusFilter]);

    const handleDelete = async (q: ServiceQuote) => {
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'serviceQuotes', q.id));
            toast({ title: 'Service quote removed', description: q.customerName });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove' });
        }
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <ClipboardCheck className="h-4 w-4" />
                            Service &amp; Counter Quotes
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Dealer-facing service quotes built from your operations + parts catalogue — plus standalone
                            counter quotes for motors, trailers, dealer-fit options and rigging kits (no boat required).
                            Click a card to open the detail view — edit, download the PDF, or send to the customer.
                        </CardDescription>
                    </div>
                    <Button onClick={() => setCreateOpen(true)} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> New service quote
                    </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-3">
                    <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
                        All ({quotes?.length ?? 0})
                    </FilterChip>
                    {STATUS_OPTIONS.map(s => (
                        <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                            {s} ({(quotes ?? []).filter(q => q.status === s).length})
                        </FilterChip>
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading…</span></div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <ClipboardCheck className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">
                            {quotes && quotes.length > 0 ? 'No quotes match this status.' : 'No service quotes yet. Create your first one.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filtered.map(q => (
                            <ServiceQuoteCard
                                key={q.id}
                                quote={q}
                                onOpen={() => setDetailQuote(q)}
                                onStatusChange={async (status) => {
                                    await updateDoc(doc(firestore, 'organisations', organisationId, 'serviceQuotes', q.id), {
                                        status,
                                        updatedAt: serverTimestamp(),
                                    });
                                    toast({ title: `Status → ${status}` });
                                }}
                                onDelete={() => handleDelete(q)}
                            />
                        ))}
                    </div>
                )}
            </CardContent>

            <ServiceQuoteCreateDialog
                initialKind={initialKind}
                open={createOpen}
                onOpenChange={(o) => { setCreateOpen(o); if (!o) setInitialCatalogTab(null); }}
                organisationId={organisationId}
                initialCatalogTab={initialCatalogTab}
            />

            <ServiceQuoteDetailSheet
                open={detailQuote !== null}
                onOpenChange={(open) => { if (!open) setDetailQuote(null); }}
                organisationId={organisationId}
                quote={detailQuote}
                organisation={organisation}
            />
        </Card>
    );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <Button
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            onClick={onClick}
            className="rounded-full h-7 text-[10px] uppercase font-bold"
        >
            {children}
        </Button>
    );
}

function ServiceQuoteCard({
    quote, onStatusChange, onDelete, onOpen,
}: {
    quote: ServiceQuote;
    onStatusChange: (status: ServiceQuoteStatus) => Promise<void>;
    onDelete: () => void;
    onOpen?: () => void;
}) {
    return (
        <div
            onClick={onOpen}
            className="rounded-2xl border-2 p-4 bg-white shadow-sm space-y-2 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{quote.customerName || 'Unnamed customer'}</p>
                    {quote.vehicle && <p className="text-[10px] text-muted-foreground truncate">{quote.vehicle}</p>}
                </div>
                <Badge variant="outline" className={`${STATUS_TONE[quote.status]} text-[9px] font-bold uppercase shrink-0`}>
                    {quote.status}
                </Badge>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{quote.operations.length} ops · {quote.parts.length} parts</span>
                <span className="font-bold text-foreground tabular-nums">${quote.totalSell.toLocaleString()}</span>
            </div>
            <div
                className="flex items-center gap-1.5 pt-2 border-t"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <Select value={quote.status} onValueChange={v => onStatusChange(v as ServiceQuoteStatus)}>
                    <SelectTrigger className="h-7 text-[10px] rounded-lg border-2 flex-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                            <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------
// Create wizard (4-step)
// ---------------------------------------------------------------------

const WIZARD_STEPS = [
    { id: 1, label: 'Customer', icon: User },
    { id: 2, label: 'Operations', icon: Wrench },
    { id: 3, label: 'Parts', icon: Package },
    { id: 4, label: 'Review', icon: ClipboardCheck },
];

function ServiceQuoteCreateDialog({
    open, onOpenChange, organisationId, initialCatalogTab, initialKind,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    organisationId: string;
    /** Deep-link preselection for the CatalogItemPicker tab. */
    initialCatalogTab?: string | null;
    /** v1.34 — 'motor' = the dedicated motor-sale / repower quote kind. */
    initialKind?: string | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [step, setStep] = useState(1);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [vehicle, setVehicle] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedOps, setSelectedOps] = useState<ServiceQuoteLineOp[]>([]);
    const [selectedParts, setSelectedParts] = useState<ServiceQuoteLinePart[]>([]);
    const [saving, setSaving] = useState(false);
    /* ── v1.34 motor-quote kind (Asaf: motor-only sale + repower) ── */
    const isMotorQuote = initialKind === 'motor';
    const [saleType, setSaleType] = useState<'new' | 'repower'>('new');
    const [tradeInDesc, setTradeInDesc] = useState('');
    const [tradeInValue, setTradeInValue] = useState('');
    const [motorSnapshot, setMotorSnapshot] = useState<any | null>(null);

    useEffect(() => {
        if (!open) {
            setStep(1);
            setCustomerName('');
            setCustomerPhone('');
            setVehicle('');
            setNotes('');
            setSelectedOps([]);
            setSelectedParts([]);
            setSaleType('new');
            setTradeInDesc('');
            setTradeInValue('');
            setMotorSnapshot(null);
        }
    }, [open]);

    const opsCatalogRef = useMemoFirebase(
        () => (open ? query(collection(firestore, 'organisations', organisationId, 'serviceOperations'), orderBy('code', 'asc')) : null),
        [firestore, organisationId, open],
    );
    const { data: opsCatalog } = useCollection<ServiceOperation>(opsCatalogRef);

    const partsCatalogRef = useMemoFirebase(
        () => (open ? query(collection(firestore, 'organisations', organisationId, 'serviceParts'), orderBy('partNumber', 'asc')) : null),
        [firestore, organisationId, open],
    );
    const { data: partsCatalog } = useCollection<ServicePart>(partsCatalogRef);

    const totalSell = useMemo(() =>
        selectedOps.reduce((a, o) => a + o.sellPrice, 0)
        + selectedParts.reduce((a, p) => a + (p.sellPrice * p.qty), 0),
    [selectedOps, selectedParts]);
    const totalCost = useMemo(() =>
        selectedOps.reduce((a, o) => a + o.cost, 0)
        + selectedParts.reduce((a, p) => a + (p.cost * p.qty), 0),
    [selectedOps, selectedParts]);

    const handleSave = async () => {
        if (!customerName.trim()) {
            toast({ variant: 'destructive', title: 'Customer name required' });
            return;
        }
        if (selectedOps.length === 0 && selectedParts.length === 0) {
            toast({ variant: 'destructive', title: 'Add at least one operation or part' });
            return;
        }
        setSaving(true);
        try {
            await addDoc(collection(firestore, 'organisations', organisationId, 'serviceQuotes'), {
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim() || null,
                vehicle: vehicle.trim() || null,
                notes: notes.trim() || null,
                operations: selectedOps,
                parts: selectedParts,
                status: 'draft' as ServiceQuoteStatus,
                totalSell,
                totalCost,
                // v1.34 motor quotes — kind + sale type + trade-in + the
                // pick-time motor snapshot (image + full specs + vendor
                // branding) that drives the dedicated branded PDF.
                quoteKind: isMotorQuote ? 'motor' : 'service',
                saleType: isMotorQuote ? saleType : null,
                tradeIn: isMotorQuote && (tradeInDesc.trim() || tradeInValue.trim()) ? {
                    description: tradeInDesc.trim() || null,
                    value: parseFloat(tradeInValue) || 0,
                } : null,
                motorSnapshot: motorSnapshot || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Service quote created', description: customerName });
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to create' });
        } finally {
            setSaving(false);
        }
    };

    const canAdvance = (() => {
        if (step === 1) return customerName.trim().length > 0;
        return true;
    })();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>New Service Quote</DialogTitle>
                    <DialogDescription className="text-xs">
                        Step {step} of {WIZARD_STEPS.length}: {WIZARD_STEPS[step - 1].label}
                    </DialogDescription>
                </DialogHeader>

                {/* Stepper */}
                <div className="flex items-center gap-2 px-2 pb-2">
                    {WIZARD_STEPS.map(s => {
                        const Icon = s.icon;
                        return (
                            <div key={s.id} className="flex items-center gap-2 flex-1">
                                <div className={cn(
                                    'h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all',
                                    step === s.id ? 'bg-primary border-primary text-white' :
                                    step > s.id ? 'bg-emerald-500 border-emerald-500 text-white' :
                                    'bg-muted border-transparent text-muted-foreground',
                                )}>
                                    {step > s.id ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                                </div>
                                <span className={cn(
                                    'text-[10px] font-bold uppercase tracking-widest hidden sm:block',
                                    step === s.id ? 'text-foreground' : 'text-muted-foreground',
                                )}>
                                    {s.label}
                                </span>
                                {s.id < WIZARD_STEPS.length && (
                                    <div className={cn('flex-1 h-0.5', step > s.id ? 'bg-emerald-500' : 'bg-muted')} />
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex-1 overflow-y-auto px-1 space-y-3">
                    {step === 1 && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold">Customer name</label>
                                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="John Smith" className="rounded-xl border-2" autoFocus />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold">Phone — optional</label>
                                    <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="04xx xxx xxx" className="rounded-xl border-2" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold">Vehicle / boat — optional</label>
                                    <Input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="e.g. 2022 Yamaha F150" className="rounded-xl border-2" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold">Notes — optional</label>
                                <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl border-2 text-xs" rows={3} placeholder="Service-advisor notes (internal)." />
                            </div>
                            {/* v1.34 — motor quote kind: New sale vs Repower.
                                Repower auto-adds the Engine Removals charge from
                                the picked motor's own MPF row + captures the
                                old-motor trade-in. */}
                            {isMotorQuote && (
                                <div className="rounded-xl border-2 p-3 space-y-3 bg-slate-50/50">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Motor quote type</p>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setSaleType('new')}
                                            className={cn('flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors', saleType === 'new' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 hover:bg-slate-50')}>
                                            New motor sale
                                        </button>
                                        <button type="button" onClick={() => setSaleType('repower')}
                                            className={cn('flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors', saleType === 'repower' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 hover:bg-slate-50')}>
                                            Repower (replace existing)
                                        </button>
                                    </div>
                                    {saleType === 'repower' && (
                                        <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold">Old motor — trade-in description</label>
                                                <Input value={tradeInDesc} onChange={e => setTradeInDesc(e.target.value)} placeholder="e.g. 2015 F115 approx 900hrs" className="rounded-xl border-2" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold">Agreed trade-in value ($)</label>
                                                <Input type="number" value={tradeInValue} onChange={e => setTradeInValue(e.target.value)} placeholder="0" className="rounded-xl border-2" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <OperationsPicker
                            catalog={opsCatalog ?? []}
                            selected={selectedOps}
                            onChange={setSelectedOps}
                        />
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <PartsPicker
                                catalog={partsCatalog ?? []}
                                selected={selectedParts}
                                onChange={setSelectedParts}
                            />
                            {/* Counter-quote catalog items (decision.standalone-quotes) —
                                motors / trailers / dealer-fit / rigging kits land as
                                part-shaped lines; rigging install labour lands as an
                                op-shaped line so existing totals/PDF need no changes. */}
                            <CatalogItemPicker
                                organisationId={organisationId}
                                initialTab={initialCatalogTab}
                                repowerMode={isMotorQuote && saleType === 'repower'}
                                onAdd={({ part, installOp, bundleParts, removalOp, motorMeta }: CatalogAdd) => {
                                    setSelectedParts(prev => [...prev, part, ...(bundleParts ?? [])]);
                                    setSelectedOps(prev => [...prev,
                                        ...(installOp ? [installOp] : []),
                                        ...(removalOp ? [removalOp] : [])]);
                                    if (motorMeta) setMotorSnapshot(motorMeta);
                                }}
                            />
                        </div>
                    )}

                    {step === 4 && (
                        <ReviewStep
                            customerName={customerName}
                            customerPhone={customerPhone}
                            vehicle={vehicle}
                            notes={notes}
                            operations={selectedOps}
                            parts={selectedParts}
                            totalSell={totalSell}
                            totalCost={totalCost}
                        />
                    )}
                </div>

                <DialogFooter className="border-t pt-3">
                    <div className="flex items-center justify-between w-full">
                        <Button variant="outline" disabled={step === 1 || saving} onClick={() => setStep(s => s - 1)} className="rounded-xl">
                            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
                        </Button>
                        {step < WIZARD_STEPS.length ? (
                            <Button disabled={!canAdvance} onClick={() => setStep(s => s + 1)} className="rounded-xl">
                                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                        ) : (
                            <Button disabled={saving} onClick={handleSave} className="rounded-xl">
                                {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                                Create quote
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OperationsPicker({
    catalog, selected, onChange,
}: {
    catalog: ServiceOperation[];
    selected: ServiceQuoteLineOp[];
    onChange: (next: ServiceQuoteLineOp[]) => void;
}) {
    const [search, setSearch] = useState('');
    const filtered = useMemo(() => {
        if (!search.trim()) return catalog;
        const q = search.toLowerCase();
        return catalog.filter(o =>
            o.code.toLowerCase().includes(q) ||
            o.name.toLowerCase().includes(q),
        );
    }, [catalog, search]);

    const isOn = (id: string) => selected.some(s => s.id === id);
    const toggle = (op: ServiceOperation) => {
        if (isOn(op.id)) {
            onChange(selected.filter(s => s.id !== op.id));
        } else {
            const sell = deriveOpSell(op);
            onChange([...selected, {
                id: op.id,
                code: op.code,
                name: op.name,
                hours: op.flatRateHours,
                rate: op.hourlyRate,
                sellPrice: sell,
                cost: op.cost ?? sell * 0.6,
            }]);
        }
    };

    return (
        <div className="space-y-3">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search operations by code or name…" className="rounded-xl border-2 text-xs" />
            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                {filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-6">
                        No operations match. Operations are managed in /manage → Service Catalog.
                    </p>
                ) : filtered.map(op => {
                    const on = isOn(op.id);
                    return (
                        <button
                            key={op.id}
                            onClick={() => toggle(op)}
                            className={cn(
                                'w-full flex items-center justify-between p-2 rounded-xl border text-left transition-colors',
                                on ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-slate-50',
                            )}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                {on ? <Check className="h-3.5 w-3.5 text-primary shrink-0" /> : <div className="h-3.5 w-3.5 rounded border-2 shrink-0" />}
                                <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200 text-[10px] font-mono font-bold">{op.code}</Badge>
                                <span className="text-xs font-semibold truncate">{op.name}</span>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-xs font-bold tabular-nums">${deriveOpSell(op).toLocaleString()}</p>
                                <p className="text-[9px] text-muted-foreground tabular-nums">{op.flatRateHours.toFixed(2)}h × ${op.hourlyRate}/h</p>
                            </div>
                        </button>
                    );
                })}
            </div>
            <p className="text-[10px] text-muted-foreground">{selected.length} operation{selected.length === 1 ? '' : 's'} selected.</p>
        </div>
    );
}

// MQ-2 (perf) — parts-picker render guards for very large catalogues.
const PARTS_RENDER_CAP = 50;
const PARTS_MIN_SEARCH_CHARS = 2;

function PartsPicker({
    catalog, selected, onChange,
}: {
    catalog: ServicePart[];
    selected: ServiceQuoteLinePart[];
    onChange: (next: ServiceQuoteLinePart[]) => void;
}) {
    const [search, setSearch] = useState('');
    // MQ-2 (perf) — the org parts catalogue is 26k+ rows; rendering it all on
    // an empty search locks the dialog up. Large catalogues require ≥2 search
    // chars, and the rendered list is always capped at 50 rows with a
    // "refine your search" hint. Small catalogues keep the old show-all UX.
    const q = search.trim().toLowerCase();
    const needsSearch = catalog.length > PARTS_RENDER_CAP && q.length < PARTS_MIN_SEARCH_CHARS;
    const matches = useMemo(() => {
        if (needsSearch) return [];
        if (!q) return catalog;
        return catalog.filter(p =>
            p.partNumber.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q),
        );
    }, [catalog, q, needsSearch]);
    const filtered = useMemo(() => matches.slice(0, PARTS_RENDER_CAP), [matches]);
    const overflow = matches.length - filtered.length;

    const findSelected = (id: string) => selected.find(s => s.id === id);
    const togglePart = (part: ServicePart) => {
        const existing = findSelected(part.id);
        if (existing) {
            onChange(selected.filter(s => s.id !== part.id));
        } else {
            onChange([...selected, {
                id: part.id,
                partNumber: part.partNumber,
                name: part.name,
                qty: 1,
                cost: part.cost,
                sellPrice: part.sellPrice ?? part.cost * 1.4,
            }]);
        }
    };
    const setQty = (id: string, qty: number) => {
        onChange(selected.map(s => s.id === id ? { ...s, qty: Math.max(1, qty) } : s));
    };

    return (
        <div className="space-y-3">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search parts by number or name…" className="rounded-xl border-2 text-xs" />
            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                {needsSearch ? (
                    <p className="text-xs text-muted-foreground italic text-center py-6">
                        Type at least {PARTS_MIN_SEARCH_CHARS} characters to search the {catalog.length.toLocaleString()}-part catalogue.
                    </p>
                ) : filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-6">
                        No parts match. Parts are managed in /manage → Service Catalog.
                    </p>
                ) : filtered.map(part => {
                    const sel = findSelected(part.id);
                    const on = sel != null;
                    return (
                        <div
                            key={part.id}
                            className={cn(
                                'flex items-center justify-between p-2 rounded-xl border',
                                on ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-slate-50',
                            )}
                        >
                            <button onClick={() => togglePart(part)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                                {on ? <Check className="h-3.5 w-3.5 text-primary shrink-0" /> : <div className="h-3.5 w-3.5 rounded border-2 shrink-0" />}
                                <Badge variant="outline" className="bg-violet-50 text-violet-800 border-violet-200 text-[10px] font-mono font-bold">{part.partNumber}</Badge>
                                <span className="text-xs font-semibold truncate">{part.name}</span>
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                                {on && (
                                    <Input
                                        type="number"
                                        min={1}
                                        value={sel.qty}
                                        onChange={e => setQty(part.id, parseInt(e.target.value, 10) || 1)}
                                        onClick={e => e.stopPropagation()}
                                        className="rounded-lg border-2 h-7 w-14 text-xs tabular-nums"
                                    />
                                )}
                                <div className="text-right">
                                    <p className="text-xs font-bold tabular-nums">${(part.sellPrice ?? part.cost * 1.4).toLocaleString()}</p>
                                    <p className="text-[9px] text-muted-foreground tabular-nums">cost ${part.cost.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {overflow > 0 && (
                <p className="text-[10px] text-muted-foreground italic">
                    Showing the first {PARTS_RENDER_CAP} of {matches.length.toLocaleString()} matches — refine your search to narrow the list.
                </p>
            )}
            <p className="text-[10px] text-muted-foreground">{selected.length} part type{selected.length === 1 ? '' : 's'} selected.</p>
        </div>
    );
}

function ReviewStep({
    customerName, customerPhone, vehicle, notes, operations, parts, totalSell, totalCost,
}: {
    customerName: string;
    customerPhone: string;
    vehicle: string;
    notes: string;
    operations: ServiceQuoteLineOp[];
    parts: ServiceQuoteLinePart[];
    totalSell: number;
    totalCost: number;
}) {
    const margin = totalSell > 0 ? ((totalSell - totalCost) / totalSell) * 100 : 0;
    return (
        <div className="space-y-4">
            <div className="rounded-xl border-2 p-3 bg-slate-50">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Customer</p>
                <p className="text-sm font-bold">{customerName || '—'}</p>
                {customerPhone && <p className="text-xs text-muted-foreground">{customerPhone}</p>}
                {vehicle && <p className="text-xs">{vehicle}</p>}
                {notes && <p className="text-[11px] text-muted-foreground mt-1 italic">{notes}</p>}
            </div>

            <div className="rounded-xl border-2 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Operations ({operations.length})</p>
                {operations.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">None.</p>
                ) : operations.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-sky-700">{o.code}</span>
                        <span className="flex-1 mx-2 truncate">{o.name}</span>
                        <span className="tabular-nums font-bold">${o.sellPrice.toLocaleString()}</span>
                    </div>
                ))}
            </div>

            <div className="rounded-xl border-2 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Parts ({parts.length})</p>
                {parts.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">None.</p>
                ) : parts.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-violet-700">{p.partNumber}</span>
                        <span className="flex-1 mx-2 truncate">{p.name} × {p.qty}</span>
                        <span className="tabular-nums font-bold">${(p.sellPrice * p.qty).toLocaleString()}</span>
                    </div>
                ))}
            </div>

            <div className="rounded-xl border-2 p-3 bg-emerald-50/50">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-bold">Total (ex GST)</p>
                    <p className="text-lg font-black tabular-nums">${totalSell.toLocaleString()}</p>
                </div>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                    Cost ${totalCost.toLocaleString()} · Margin {margin.toFixed(1)}%
                </p>
            </div>
        </div>
    );
}
