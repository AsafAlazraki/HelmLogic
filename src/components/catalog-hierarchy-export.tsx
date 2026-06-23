
'use client';

/**
 * CatalogHierarchyExport (v1.18 — Story "Export Data brand -> range -> model").
 *
 * Single button + handler that walks every subscribed Boat Brand vendor,
 * pulls its ranges + models, and exports one flat CSV with the brand /
 * range / model hierarchy in adjacent columns. Companion to the v1.14
 * per-tab CSV export (Motors / Trailers tables) — same idea, different
 * shape: the hierarchy CSV gives accounting one file with the full tree,
 * not three separate per-vendor CSVs.
 *
 * Scope: Boats only. Motors + Trailers are flat per-vendor lists with no
 * range layer, so they already export cleanly via the v1.14 per-tab
 * Export CSV buttons.
 *
 * Filename: catalog-hierarchy-YYYY-MM-DD.csv
 *
 * No new Firestore paths, no new collections, no rules deploy needed.
 */

import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Loader2, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Vendor {
    id: string;
    name?: string;
    vendorType?: string;
}

export function CatalogHierarchyExport({ vendors }: { vendors: Vendor[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        const boatVendors = (vendors ?? []).filter(v => v.vendorType === 'Boat Brand');
        if (boatVendors.length === 0) {
            toast({ variant: 'destructive', title: 'No boat brands subscribed', description: 'Subscribe to a Boat Brand vendor first.' });
            return;
        }
        setExporting(true);
        try {
            const rows: Array<Record<string, any>> = [];
            for (const vendor of boatVendors) {
                const rangesSnap = await getDocs(collection(firestore, 'data-warehouse', vendor.id, 'ranges'));
                for (const rangeDoc of rangesSnap.docs) {
                    const range = rangeDoc.data() as any;
                    const modelsSnap = await getDocs(collection(firestore, 'data-warehouse', vendor.id, 'ranges', rangeDoc.id, 'models'));
                    for (const modelDoc of modelsSnap.docs) {
                        const model = modelDoc.data() as any;
                        const specs = (model.specifications ?? {}) as any;
                        const margin = (model.cost != null && model.sellPriceExclGst != null && model.sellPriceExclGst > 0)
                            ? ((model.sellPriceExclGst - model.cost) / model.sellPriceExclGst) * 100
                            : null;
                        rows.push({
                            'Brand': vendor.name ?? vendor.id,
                            'Range': range.name ?? rangeDoc.id,
                            'Model Code': model.modelCode ?? '',
                            'Model Name': model.name ?? '',
                            'Length (m)': specs.lengthMtr ?? '',
                            'Beam (m)': specs.beamMtr ?? '',
                            'Tube (m)': specs.tubeMtr ?? '',
                            'Max HP': specs.maxHp ?? '',
                            'Min HP': specs.minHp ?? '',
                            'Capacity': specs.maxCapacity ?? '',
                            'Cost (ex GST)': model.cost ?? '',
                            'Sell (ex GST)': model.sellPriceExclGst ?? '',
                            'Margin (%)': margin != null ? margin.toFixed(1) : '',
                            'Has Cover': specs.coverImageUrl ? 'Y' : 'N',
                            'Updated': model.updatedAt ?? '',
                        });
                    }
                }
            }
            if (rows.length === 0) {
                toast({ variant: 'destructive', title: 'No models found', description: 'The subscribed boat brands have no ranges or models in the catalogue.' });
                return;
            }
            const headers = Object.keys(rows[0]);
            const esc = (v: any) => {
                if (v == null) return '';
                const s = String(v);
                return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const csv = [
                headers.join(','),
                ...rows.map(r => headers.map(h => esc(r[h])).join(',')),
            ].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `catalog-hierarchy-${stamp}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            toast({ title: `Exported ${rows.length} rows`, description: `${boatVendors.length} brand(s), full hierarchy.` });
        } catch (err: any) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Export failed', description: err?.message ?? String(err) });
        } finally {
            setExporting(false);
        }
    };

    return (
        <Button
            data-testid="catalog-hierarchy-export"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-xl text-xs h-9"
        >
            {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />}
            Export hierarchy
        </Button>
    );
}
