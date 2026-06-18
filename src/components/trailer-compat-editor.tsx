
'use client';

/**
 * TrailerCompatEditor (v1.17 — Story 3.9.4).
 *
 * Boat ↔ trailer compatibility matrix. Mirrors the v1.16/3.9.3 dealer-fit
 * compat editor (boat ↔ dealer-fit-category checklist) but for trailers.
 *
 * Each boat model gets an `applicableTrailerCodes: string[]` field. When
 * the operator runs a quote, the Step 4 trailer picker auto-filters to
 * codes on the list (with an "Show all" escape hatch). Default empty
 * means "no filter" so existing models behave like v1.16.
 *
 * Surface: drilldown panel on the model editor / BoatsTable expanded row.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Truck } from 'lucide-react';

interface TrailerOption {
    code: string;
    name: string;
    vendorName?: string;
}

interface TrailerCompatEditorProps {
    /** Boat vendor ID (data-warehouse/{vendorId}). */
    vendorId: string;
    /** Range ID. */
    rangeId: string;
    /** Model document — must have `applicableTrailerCodes?: string[]`. */
    model: { id: string; applicableTrailerCodes?: string[] };
}

export function TrailerCompatEditor({ vendorId, rangeId, model }: TrailerCompatEditorProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [selected, setSelected] = useState<Set<string>>(new Set(model.applicableTrailerCodes ?? []));
    const [allTrailers, setAllTrailers] = useState<TrailerOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                // Pull every Trailer Brand vendor's trailers. The matrix lives on
                // the boat model so the same code can apply across brands; the
                // checklist shows the union.
                const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
                const out: TrailerOption[] = [];
                for (const v of vendorsSnap.docs) {
                    const data = v.data() as any;
                    if (data?.vendorType !== 'Trailer Brand') continue;
                    const trailersSnap = await getDocs(collection(firestore, 'data-warehouse', v.id, 'trailers'));
                    for (const t of trailersSnap.docs) {
                        const td = t.data() as any;
                        if (!td.code) continue;
                        out.push({ code: String(td.code), name: String(td.name ?? td.code), vendorName: data.name });
                    }
                }
                out.sort((a, b) => a.code.localeCompare(b.code));
                if (!cancelled) setAllTrailers(out);
            } catch (err) {
                console.error('trailer-compat load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [firestore]);

    const toggle = (code: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const save = async () => {
        setSaving(true);
        try {
            const ref = doc(firestore, 'data-warehouse', vendorId, 'ranges', rangeId, 'models', model.id);
            await updateDoc(ref, {
                applicableTrailerCodes: Array.from(selected),
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Trailer compatibility saved', description: `${selected.size} trailer${selected.size === 1 ? '' : 's'} attached.` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    const dirty = useMemo(() => {
        const cur = new Set(model.applicableTrailerCodes ?? []);
        if (cur.size !== selected.size) return true;
        for (const c of cur) if (!selected.has(c)) return true;
        return false;
    }, [model.applicableTrailerCodes, selected]);

    return (
        <div data-testid="trailer-compat-editor" className="rounded-lg border-2 border-dashed bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground inline-flex items-center gap-1">
                    <Truck className="h-3 w-3" /> COMPATIBLE TRAILERS
                </p>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">
                        {selected.size} attached
                    </Badge>
                    <Button size="sm" onClick={save} disabled={!dirty || saving} className="h-7 rounded-md text-[10px]">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Save
                    </Button>
                </div>
            </div>
            {loading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    <span className="text-[10px]">Loading trailers…</span>
                </div>
            ) : allTrailers.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">No trailers in the catalogue yet.</p>
            ) : (
                <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                    {allTrailers.map(t => (
                        <label key={t.code} className="flex items-center gap-2 text-[10px] cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                            <Checkbox checked={selected.has(t.code)} onCheckedChange={() => toggle(t.code)} />
                            <span className="font-mono font-bold">{t.code}</span>
                            <span className="text-muted-foreground truncate">{t.name}</span>
                        </label>
                    ))}
                </div>
            )}
            <p className="text-[9px] text-muted-foreground italic">
                Empty list = no filter. Step 4 of the quote will show every trailer.
                Selecting one or more attaches the filter so only matching codes appear.
            </p>
        </div>
    );
}
