
'use client';

/**
 * CatalogExportImport (v1.11 — global configurator export/import).
 *
 * Single-page surface for snapshotting the org's catalogue state to
 * a multi-sheet xlsx + importing the same shape back. Covers:
 *
 *   Sheet name          | Source path
 *   --------------------|--------------------------------------------
 *   Fit-Up              | organisations/{orgId}/fitUpItems
 *   Service Operations  | organisations/{orgId}/serviceOperations
 *   Service Parts       | organisations/{orgId}/serviceParts
 *   Dealer Fit          | organisations/{orgId}/dealerFitSelections
 *   Model Overrides     | organisations/{orgId}/modelOverrides
 *   Trailer Overrides   | organisations/{orgId}/trailerOverrides
 *
 * Each sheet is upsert-by-natural-key on import (per the v1.4
 * remediation lesson — clear-and-replace destroys operator edits).
 * Vendor / range / model / variant data lives on the global
 * `data-warehouse/...` hierarchy and is NOT exported here — it's
 * shared across orgs and authored centrally.
 *
 * Toast on completion reports per-sheet counts:
 *   "N updated · M created · K skipped" on each sheet processed.
 *
 * NOT in v1.11 scope:
 *   - Vendor / range / model / variant import (lives at the global
 *     data-warehouse layer; cross-org concerns; separate workflow).
 *   - Schema migration / format negotiation (the export format IS
 *     the import format, one-to-one).
 */

import { useState } from 'react';
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useFirestore } from '@/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CatalogExportImportProps {
    organisationId: string;
}

interface SheetSpec {
    sheetName: string;
    collectionPath: string;
    naturalKey: string;
    rowShape: (data: any) => Record<string, any>;
}

/** Build a SheetSpec list — each describes a collection + how to
 *  flatten its docs for xlsx + which column is the upsert key. */
function buildSheetSpecs(orgId: string): SheetSpec[] {
    return [
        {
            sheetName: 'Fit-Up',
            collectionPath: `organisations/${orgId}/fitUpItems`,
            naturalKey: 'name',
            rowShape: d => ({
                name: d.name ?? '',
                tier: d.tier ?? 'simple',
                cost: d.cost ?? 0,
                sellPrice: d.sellPrice ?? '',
                notes: d.notes ?? '',
                moduleIds: Array.isArray(d.moduleIds) ? d.moduleIds.join('|') : '',
            }),
        },
        {
            sheetName: 'Service Operations',
            collectionPath: `organisations/${orgId}/serviceOperations`,
            naturalKey: 'code',
            rowShape: d => ({
                code: d.code ?? '',
                name: d.name ?? '',
                flatRateHours: d.flatRateHours ?? 0,
                hourlyRate: d.hourlyRate ?? 0,
                cost: d.cost ?? '',
                sellPrice: d.sellPrice ?? '',
                notes: d.notes ?? '',
            }),
        },
        {
            sheetName: 'Service Parts',
            collectionPath: `organisations/${orgId}/serviceParts`,
            naturalKey: 'partNumber',
            rowShape: d => ({
                partNumber: d.partNumber ?? '',
                name: d.name ?? '',
                cost: d.cost ?? 0,
                sellPrice: d.sellPrice ?? '',
                stockLevel: d.stockLevel ?? '',
                notes: d.notes ?? '',
            }),
        },
        {
            sheetName: 'Model Overrides',
            collectionPath: `organisations/${orgId}/modelOverrides`,
            naturalKey: 'modelId',
            rowShape: d => ({
                modelId: d.modelId ?? d.id ?? '',
                name: d.name ?? '',
                cost: d.cost ?? '',
                sellPriceExclGst: d.sellPriceExclGst ?? '',
                coverImageUrl: d.coverImageUrl ?? '',
            }),
        },
        {
            sheetName: 'Trailer Overrides',
            collectionPath: `organisations/${orgId}/trailerOverrides`,
            naturalKey: 'trailerId',
            rowShape: d => ({
                trailerId: d.trailerId ?? d.id ?? '',
                name: d.name ?? '',
                cost: d.cost ?? '',
                sellPriceExclGst: d.sellPriceExclGst ?? '',
                pricingSource: d.pricingSource ?? '',
            }),
        },
    ];
}

function pickFirst(row: Record<string, any>, ...candidates: string[]): any {
    const lowered: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) lowered[k.toLowerCase().trim()] = v;
    for (const c of candidates) {
        if (c.toLowerCase() in lowered && lowered[c.toLowerCase()] != null && lowered[c.toLowerCase()] !== '') {
            return lowered[c.toLowerCase()];
        }
    }
    return null;
}

function parseImportValue(v: any): any {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (s === '') return null;
    // Numeric coercion for cost / price / hours fields — anything that
    // looks like a number becomes one.
    const cleaned = s.replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(cleaned)) return n;
    return s;
}

export function CatalogExportImport({ organisationId }: CatalogExportImportProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [busy, setBusy] = useState<'export' | 'import' | null>(null);

    const handleExport = async () => {
        setBusy('export');
        try {
            const specs = buildSheetSpecs(organisationId);
            const wb = XLSX.utils.book_new();
            const sheetSummaries: string[] = [];

            for (const spec of specs) {
                const snap = await getDocs(collection(firestore, spec.collectionPath));
                const rows: Record<string, any>[] = [];
                snap.forEach(d => rows.push(spec.rowShape(d.data())));
                const ws = rows.length > 0
                    ? XLSX.utils.json_to_sheet(rows)
                    : XLSX.utils.aoa_to_sheet([[`No rows in ${spec.sheetName}`]]);
                XLSX.utils.book_append_sheet(wb, ws, spec.sheetName);
                sheetSummaries.push(`${spec.sheetName}: ${rows.length}`);
            }

            const stamp = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `catalog-export-${stamp}.xlsx`);

            toast({
                title: 'Catalog exported',
                description: sheetSummaries.join(' · '),
            });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Export failed', description: String(err) });
        } finally {
            setBusy(null);
        }
    };

    const handleImportFile = async (file: File) => {
        setBusy('import');
        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            const specs = buildSheetSpecs(organisationId);
            const summaries: string[] = [];

            for (const spec of specs) {
                if (!wb.SheetNames.includes(spec.sheetName)) {
                    summaries.push(`${spec.sheetName}: missing`);
                    continue;
                }
                const sheet = wb.Sheets[spec.sheetName];
                const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

                // Snapshot existing docs keyed by natural key for upsert.
                const existingSnap = await getDocs(collection(firestore, spec.collectionPath));
                const byKey = new Map<string, { id: string; data: any }>();
                existingSnap.forEach(d => {
                    const data = d.data();
                    const key = String(data[spec.naturalKey] ?? '').trim().toLowerCase();
                    if (key) byKey.set(key, { id: d.id, data });
                });

                let updated = 0;
                let created = 0;
                let skipped = 0;
                const writes: Promise<unknown>[] = [];

                for (const row of rows) {
                    const keyValRaw = pickFirst(row, spec.naturalKey, spec.naturalKey.toLowerCase(), spec.naturalKey.toUpperCase());
                    const keyVal = keyValRaw != null ? String(keyValRaw).trim() : '';
                    if (!keyVal) {
                        skipped++;
                        continue;
                    }

                    // Build the payload from raw row, normalising numeric / string fields.
                    const payload: Record<string, any> = {};
                    for (const [k, v] of Object.entries(row)) {
                        const cleaned = parseImportValue(v);
                        if (cleaned == null) continue;
                        // moduleIds is stored as `|`-separated string in xlsx; back to array.
                        if (k === 'moduleIds' && typeof cleaned === 'string') {
                            payload[k] = cleaned.split('|').map(s => s.trim()).filter(Boolean);
                        } else {
                            payload[k] = cleaned;
                        }
                    }
                    payload.updatedAt = serverTimestamp();

                    const existing = byKey.get(keyVal.toLowerCase());
                    if (existing) {
                        writes.push(updateDoc(doc(firestore, spec.collectionPath, existing.id), payload));
                        updated++;
                    } else {
                        writes.push(addDoc(collection(firestore, spec.collectionPath), {
                            ...payload,
                            createdAt: serverTimestamp(),
                        }));
                        created++;
                    }
                }

                await Promise.all(writes);
                summaries.push(`${spec.sheetName}: ${updated}u/${created}c/${skipped}s`);
            }

            toast({
                title: 'Catalog import complete',
                description: summaries.join(' · '),
            });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Import failed', description: String(err) });
        } finally {
            setBusy(null);
        }
    };

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        await handleImportFile(file);
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <Database className="h-4 w-4" />
                    Global Catalog Export / Import
                </CardTitle>
                <CardDescription className="text-xs">
                    Snapshot or restore the org's catalogue in one xlsx file. Sheets:
                    Fit-Up · Service Operations · Service Parts · Model Overrides · Trailer Overrides.
                    Import is upsert-by-natural-key — partial files won't clobber what's already there.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-3">
                    <Button onClick={handleExport} disabled={busy !== null} className="rounded-xl">
                        {busy === 'export' ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting…</>
                        ) : (
                            <><Download className="h-4 w-4 mr-2" /> Export entire catalog</>
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        disabled={busy !== null}
                        onClick={e => (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click()}
                        className="rounded-xl"
                    >
                        {busy === 'import' ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…</>
                        ) : (
                            <><Upload className="h-4 w-4 mr-2" /> Import from xlsx</>
                        )}
                    </Button>
                    <input
                        type="file"
                        accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={onFileChange}
                        className="hidden"
                    />
                </div>
                <div className="text-[10px] text-muted-foreground space-y-1">
                    <p><strong>Export format:</strong> multi-sheet xlsx — each sheet is one collection.</p>
                    <p><strong>Import format:</strong> same shape as export. Unknown sheet names are ignored. Per-sheet natural keys:</p>
                    <ul className="list-disc list-inside ml-2">
                        <li>Fit-Up: <code>name</code> (case-insensitive)</li>
                        <li>Service Operations: <code>code</code></li>
                        <li>Service Parts: <code>partNumber</code></li>
                        <li>Model Overrides: <code>modelId</code></li>
                        <li>Trailer Overrides: <code>trailerId</code></li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    );
}
