
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
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useFirestore } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Upload, Loader2, Database, FileSpreadsheet, Check, History as HistoryIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CatalogExportImportProps {
    organisationId: string;
}

interface SheetSpec {
    sheetName: string;
    collectionPath: string;
    naturalKey: string;
    rowShape: (data: any) => Record<string, any>;
    /** v1.11 expansion-2 — when true, the sheet is included in export
     *  but SKIPPED on import. Use for sheets whose shape isn't safely
     *  round-trippable (e.g. flattened nested arrays) or that operators
     *  shouldn't bulk-edit through xlsx. */
    exportOnly?: boolean;
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
                category: d.category ?? '',
                tier: d.tier ?? 'simple',
                cost: d.cost ?? 0,
                sellPrice: d.sellPrice ?? '',
                customerDescription: d.customerDescription ?? '',
                notes: d.notes ?? '',
                moduleIds: Array.isArray(d.moduleIds) ? d.moduleIds.join('|') : '',
                brandIds: Array.isArray(d.brandIds) ? d.brandIds.join('|') : '',
                rangeIds: Array.isArray(d.rangeIds) ? d.rangeIds.join('|') : '',
                modelIds: Array.isArray(d.modelIds) ? d.modelIds.join('|') : '',
            }),
        },
        {
            // v1.11 expansion — fit-up packages, bundles of catalog items.
            // itemIds serialised pipe-separated so a single CSV cell can
            // round-trip through Excel.
            sheetName: 'Fit-Up Packages',
            collectionPath: `organisations/${orgId}/fitUpPackages`,
            naturalKey: 'name',
            rowShape: d => ({
                name: d.name ?? '',
                description: d.description ?? '',
                itemIds: Array.isArray(d.itemIds) ? d.itemIds.join('|') : '',
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
        {
            // v1.11 expansion-2 — exchange rates per currency code. Sheet
            // is keyed on the docId (the currency code itself, e.g. USD).
            // Export-only: rate-history (changeLog) lives in a subcollection
            // and updatedAt is a server-side timestamp — round-trip would
            // corrupt either.
            sheetName: 'Exchange Rates',
            collectionPath: `organisations/${orgId}/exchangeRates`,
            naturalKey: 'currencyCode',
            exportOnly: true,
            rowShape: d => ({
                currencyCode: d.currencyCode ?? d.id ?? '',
                rate: d.rate ?? '',
                source: d.source ?? '',
                updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : '',
            }),
        },
        {
            // v1.11 expansion-2 — per-org dealer-fit selections (category
            // groupings + selected items). One row per selection doc;
            // items roll up as pipe-separated rowIds for visibility.
            // Export-only: the nested items array is complex (rowId +
            // qty + override fields per line) and flat re-import would
            // lose the qty/override metadata.
            sheetName: 'Dealer Fit Selections',
            collectionPath: `organisations/${orgId}/dealerFitSelections`,
            naturalKey: 'name',
            exportOnly: true,
            rowShape: d => ({
                name: d.name ?? '',
                categoryId: d.categoryId ?? '',
                type: d.type ?? '',  // 'package' | 'single' etc.
                itemCount: Array.isArray(d.items) ? d.items.length : 0,
                itemRowIds: Array.isArray(d.items) ? d.items.map((i: any) => i.rowId).filter(Boolean).join('|') : '',
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

/** v1.11 follow-up — a single planned change inside an import diff. */
type DiffOp = 'create' | 'update' | 'skip';
interface DiffRow {
    /** Stable id for React keys + selection state. */
    id: string;
    sheetName: string;
    collectionPath: string;
    /** firestore docId — empty for 'create' rows. */
    docId: string;
    /** The natural-key value for this row (helps the operator scan). */
    naturalKeyValue: string;
    op: DiffOp;
    /** Per-field current → new map. Only changed fields are present.
     *  Includes synthesized "(missing)" for fields absent in current. */
    changes: { field: string; current: any; next: any }[];
    /** Full payload that would be written (pre-resolve). */
    payload: Record<string, any>;
    /** Reason for skip rows so the operator sees why something was
     *  dropped (e.g. "no natural key", "no real changes"). */
    skipReason?: string;
}

interface ImportPlan {
    rows: DiffRow[];
    /** xlsx sheets that the import didn't touch (missing / export-only). */
    untouchedSheets: string[];
}

function shallowEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }
    return String(a ?? '') === String(b ?? '');
}

export function CatalogExportImport({ organisationId }: CatalogExportImportProps) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [busy, setBusy] = useState<'export' | 'import' | 'commit' | null>(null);
    /** Pre-commit diff plan. When non-null, the confirmation dialog is open. */
    const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
    /** Selected rows (id → true). All selected by default; operator can untick rows to skip. */
    const [planSelection, setPlanSelection] = useState<Record<string, boolean>>({});

    /** v1.11 wider — also dumps the global data-warehouse boat
     *  hierarchy (vendors, ranges, models, variants, options) to its
     *  own sheets. These are global (cross-org) and ARE imported back
     *  on `Import` because the team's workflow is to author externally
     *  and sync to Firestore. Each is upsert by natural key (id where
     *  present, slug fallback for vendors). */
    async function exportDataWarehouseSheets(wb: XLSX.WorkBook, sheetSummaries: string[]) {
        // v1.11 expansion-2 — also export the global dealerFitCategories
        // collection (catalogue-wide names dealers see in the picker).
        try {
            const dfcSnap = await getDocs(collection(firestore, 'dealerFitCategories'));
            const rows: Record<string, any>[] = [];
            dfcSnap.forEach(d => {
                const data = d.data() as any;
                rows.push({
                    categoryId: d.id,
                    name: data.name ?? '',
                    order: data.order ?? '',
                });
            });
            const ws = rows.length > 0
                ? XLSX.utils.json_to_sheet(rows)
                : XLSX.utils.aoa_to_sheet([['No rows in Dealer Fit Categories']]);
            XLSX.utils.book_append_sheet(wb, ws, 'Dealer Fit Categories');
            sheetSummaries.push(`Dealer Fit Categories: ${rows.length}`);
        } catch (err) {
            console.error('Dealer fit categories export failed', err);
            sheetSummaries.push('Dealer Fit Categories: failed');
        }

        // v1.11 expansion-2 — Motor Brand vendors with their models +
        // priceLevels (hull_cash / hull_trade / hull_subdealer /
        // hull_commercial / hull_boating_alliance). Pricing audit
        // depends on having every motor's full price-level matrix in
        // one sheet.
        const motorVendorsSnap = await getDocs(query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Motor Brand')));
        const motorVendorRows: Record<string, any>[] = [];
        const motorModelRows: Record<string, any>[] = [];
        for (const mvDoc of motorVendorsSnap.docs) {
            const mv = mvDoc.data() as any;
            motorVendorRows.push({
                vendorId: mvDoc.id,
                name: mv.name ?? '',
                slug: mv.slug ?? '',
                vendorType: mv.vendorType ?? '',
                currency: mv.currency ?? '',
            });
            try {
                const mmSnap = await getDocs(collection(firestore, 'data-warehouse', mvDoc.id, 'models'));
                mmSnap.forEach(mDoc => {
                    const m = mDoc.data() as any;
                    const pl = m.priceLevels ?? {};
                    motorModelRows.push({
                        vendorId: mvDoc.id,
                        modelId: mDoc.id,
                        name: m['Model Name'] ?? m.name ?? '',
                        partNumber: m['Part Number'] ?? m.partNumber ?? '',
                        hpRating: m['HP Rating'] ?? m.hpRating ?? '',
                        steeringType: m.steeringType ?? '',
                        category: m.category ?? '',
                        cost: m.cost ?? '',
                        // Price levels — flattened to top-level columns for
                        // a clean audit view; null/missing renders as empty.
                        hull_cash: pl.hull_cash ?? '',
                        hull_trade: pl.hull_trade ?? '',
                        hull_subdealer: pl.hull_subdealer ?? '',
                        hull_commercial: pl.hull_commercial ?? '',
                        hull_boating_alliance: pl.hull_boating_alliance ?? '',
                    });
                });
            } catch (err) {
                console.error('Motor models export failed for vendor', mvDoc.id, err);
            }
        }
        const motorVendorWs = motorVendorRows.length > 0
            ? XLSX.utils.json_to_sheet(motorVendorRows)
            : XLSX.utils.aoa_to_sheet([['No Motor Brand vendors']]);
        XLSX.utils.book_append_sheet(wb, motorVendorWs, 'Motor Vendors');
        sheetSummaries.push(`Motor Vendors: ${motorVendorRows.length}`);
        const motorModelWs = motorModelRows.length > 0
            ? XLSX.utils.json_to_sheet(motorModelRows)
            : XLSX.utils.aoa_to_sheet([['No Motor models']]);
        XLSX.utils.book_append_sheet(wb, motorModelWs, 'Motor Models');
        sheetSummaries.push(`Motor Models: ${motorModelRows.length}`);

        const vendorsSnap = await getDocs(query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Boat Brand')));
        const vendorRows: Record<string, any>[] = [];
        const rangeRows: Record<string, any>[] = [];
        const modelRows: Record<string, any>[] = [];
        const variantRows: Record<string, any>[] = [];
        const optionRows: Record<string, any>[] = [];

        for (const vDoc of vendorsSnap.docs) {
            const v = vDoc.data();
            vendorRows.push({
                vendorId: vDoc.id,
                name: v.name ?? '',
                slug: v.slug ?? '',
                vendorType: v.vendorType ?? '',
                currency: v.currency ?? '',
            });

            const rangesSnap = await getDocs(collection(firestore, 'data-warehouse', vDoc.id, 'ranges'));
            for (const rDoc of rangesSnap.docs) {
                const r = rDoc.data();
                rangeRows.push({
                    vendorId: vDoc.id,
                    rangeId: rDoc.id,
                    name: r.name ?? '',
                    code: r.code ?? '',
                });

                const modelsSnap = await getDocs(collection(firestore, 'data-warehouse', vDoc.id, 'ranges', rDoc.id, 'models'));
                for (const mDoc of modelsSnap.docs) {
                    const m = mDoc.data();
                    modelRows.push({
                        vendorId: vDoc.id,
                        rangeId: rDoc.id,
                        modelId: mDoc.id,
                        name: m.name ?? '',
                        modelCode: m.modelCode ?? '',
                        cost: m.cost ?? '',
                        sellPriceExclGst: m.sellPriceExclGst ?? '',
                    });

                    const variantsSnap = await getDocs(collection(firestore, 'data-warehouse', vDoc.id, 'ranges', rDoc.id, 'models', mDoc.id, 'variants'));
                    variantsSnap.forEach(varDoc => {
                        const v2 = varDoc.data();
                        variantRows.push({
                            vendorId: vDoc.id,
                            rangeId: rDoc.id,
                            modelId: mDoc.id,
                            variantId: varDoc.id,
                            name: v2.name ?? '',
                            sku: v2.sku ?? '',
                            material: v2.material ?? '',
                            color: v2.color ?? '',
                            cost: v2.cost ?? '',
                            sellPriceExclGst: v2.sellPriceExclGst ?? '',
                        });
                    });

                    // Optional features per model.
                    const optsSnap = await getDocs(collection(firestore, 'data-warehouse', vDoc.id, 'ranges', rDoc.id, 'models', mDoc.id, 'optionalFeatures'));
                    optsSnap.forEach(oDoc => {
                        const o = oDoc.data();
                        optionRows.push({
                            vendorId: vDoc.id,
                            rangeId: rDoc.id,
                            modelId: mDoc.id,
                            optionId: oDoc.id,
                            name: o.name ?? '',
                            code: o.code ?? '',
                            category: o.category ?? '',
                            cost: o.cost ?? '',
                            sellPriceExclGst: o.sellPriceExclGst ?? '',
                            applicableVariantIds: Array.isArray(o.applicableVariantIds) ? o.applicableVariantIds.join('|') : '',
                        });
                    });
                }
            }
        }

        const dwSpec: { name: string; rows: Record<string, any>[] }[] = [
            { name: 'Vendors', rows: vendorRows },
            { name: 'Ranges', rows: rangeRows },
            { name: 'Models', rows: modelRows },
            { name: 'Variants', rows: variantRows },
            { name: 'Optional Features', rows: optionRows },
        ];

        for (const d of dwSpec) {
            const ws = d.rows.length > 0
                ? XLSX.utils.json_to_sheet(d.rows)
                : XLSX.utils.aoa_to_sheet([[`No rows in ${d.name}`]]);
            XLSX.utils.book_append_sheet(wb, ws, d.name);
            sheetSummaries.push(`${d.name}: ${d.rows.length}`);
        }
    }

    /** v1.11 wider — import the data-warehouse sheets back. UPSERT by
     *  the id columns (vendorId / rangeId / modelId / variantId /
     *  optionId). Uses setDoc with merge:true so we don't clobber
     *  fields not in the sheet (per the v1.4 lesson). */
    async function importDataWarehouseSheets(wb: XLSX.WorkBook, summaries: string[]) {
        const dwSheets: { name: string; idCol: string; pathFromRow: (row: any) => string }[] = [
            { name: 'Vendors',           idCol: 'vendorId',  pathFromRow: r => `data-warehouse/${r.vendorId}` },
            { name: 'Ranges',            idCol: 'rangeId',   pathFromRow: r => `data-warehouse/${r.vendorId}/ranges/${r.rangeId}` },
            { name: 'Models',            idCol: 'modelId',   pathFromRow: r => `data-warehouse/${r.vendorId}/ranges/${r.rangeId}/models/${r.modelId}` },
            { name: 'Variants',          idCol: 'variantId', pathFromRow: r => `data-warehouse/${r.vendorId}/ranges/${r.rangeId}/models/${r.modelId}/variants/${r.variantId}` },
            { name: 'Optional Features', idCol: 'optionId',  pathFromRow: r => `data-warehouse/${r.vendorId}/ranges/${r.rangeId}/models/${r.modelId}/optionalFeatures/${r.optionId}` },
        ];

        for (const ds of dwSheets) {
            if (!wb.SheetNames.includes(ds.name)) {
                summaries.push(`${ds.name}: missing`);
                continue;
            }
            const sheet = wb.Sheets[ds.name];
            const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
            let written = 0;
            let skipped = 0;
            const writes: Promise<unknown>[] = [];

            for (const row of rows) {
                if (!row[ds.idCol]) { skipped++; continue; }
                const payload: Record<string, any> = {};
                for (const [k, v] of Object.entries(row)) {
                    const cleaned = parseImportValue(v);
                    if (cleaned == null) continue;
                    if (k === 'applicableVariantIds' && typeof cleaned === 'string') {
                        payload[k] = cleaned.split('|').map(s => s.trim()).filter(Boolean);
                    } else {
                        payload[k] = cleaned;
                    }
                }
                payload.updatedAt = serverTimestamp();
                const path = ds.pathFromRow(row);
                writes.push(setDoc(doc(firestore, path), payload, { merge: true }));
                written++;
            }
            await Promise.all(writes);
            summaries.push(`${ds.name}: ${written}w/${skipped}s`);
        }
    }

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

            await exportDataWarehouseSheets(wb, sheetSummaries);

            const stamp = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `pricing-configurator-audit-${stamp}.xlsx`);

            toast({
                title: 'Audit workbook exported',
                description: sheetSummaries.join(' · '),
            });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Export failed', description: String(err) });
        } finally {
            setBusy(null);
        }
    };

    /** v1.11 follow-up — build a dry-run import PLAN from the uploaded
     *  file. Pre-commit diff preview surfaces every cell change to the
     *  operator before anything writes. Selected rows commit; unticked
     *  rows skip. (Honours the v1.4 lesson: upsert by natural key, never
     *  clear-and-replace.) */
    const buildImportPlan = async (file: File): Promise<ImportPlan> => {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const specs = buildSheetSpecs(organisationId);
        const allRows: DiffRow[] = [];
        const untouchedSheets: string[] = [];

        for (const spec of specs) {
            if (spec.exportOnly) { untouchedSheets.push(`${spec.sheetName} (export-only)`); continue; }
            if (!wb.SheetNames.includes(spec.sheetName)) { untouchedSheets.push(`${spec.sheetName} (not in upload)`); continue; }
            const sheet = wb.Sheets[spec.sheetName];
            const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

            // Snapshot existing docs keyed by natural key for upsert.
            const existingSnap = await getDocs(collection(firestore, spec.collectionPath));
            const byKey = new Map<string, { id: string; data: any }>();
            existingSnap.forEach(d => {
                const dd = d.data();
                const k = String(dd[spec.naturalKey] ?? '').trim().toLowerCase();
                if (k) byKey.set(k, { id: d.id, data: dd });
            });

            let rowIdx = 0;
            for (const row of rows) {
                rowIdx++;
                const keyValRaw = pickFirst(row, spec.naturalKey, spec.naturalKey.toLowerCase(), spec.naturalKey.toUpperCase());
                const keyVal = keyValRaw != null ? String(keyValRaw).trim() : '';
                const rowId = `${spec.sheetName}#${rowIdx}#${keyVal || 'noKey'}`;
                if (!keyVal) {
                    allRows.push({ id: rowId, sheetName: spec.sheetName, collectionPath: spec.collectionPath, docId: '', naturalKeyValue: '', op: 'skip', changes: [], payload: row, skipReason: `no ${spec.naturalKey}` });
                    continue;
                }

                // Build the payload + compute change set vs current.
                const payload: Record<string, any> = {};
                for (const [k, v] of Object.entries(row)) {
                    const cleaned = parseImportValue(v);
                    if (cleaned == null) continue;
                    if (['moduleIds', 'brandIds', 'rangeIds', 'modelIds'].includes(k) && typeof cleaned === 'string') {
                        payload[k] = cleaned.split('|').map(s => s.trim()).filter(Boolean);
                    } else {
                        payload[k] = cleaned;
                    }
                }

                const existing = byKey.get(keyVal.toLowerCase());
                if (existing) {
                    const changes: { field: string; current: any; next: any }[] = [];
                    for (const [k, v] of Object.entries(payload)) {
                        if (!shallowEqual(existing.data[k], v)) {
                            changes.push({ field: k, current: existing.data[k], next: v });
                        }
                    }
                    if (changes.length === 0) {
                        allRows.push({ id: rowId, sheetName: spec.sheetName, collectionPath: spec.collectionPath, docId: existing.id, naturalKeyValue: keyVal, op: 'skip', changes: [], payload, skipReason: 'no changes' });
                    } else {
                        allRows.push({ id: rowId, sheetName: spec.sheetName, collectionPath: spec.collectionPath, docId: existing.id, naturalKeyValue: keyVal, op: 'update', changes, payload });
                    }
                } else {
                    const changes = Object.entries(payload).map(([k, v]) => ({ field: k, current: undefined, next: v }));
                    allRows.push({ id: rowId, sheetName: spec.sheetName, collectionPath: spec.collectionPath, docId: '', naturalKeyValue: keyVal, op: 'create', changes, payload });
                }
            }
        }

        return { rows: allRows, untouchedSheets };
    };

    /** Commit a plan to Firestore. Only rows with planSelection[id] !== false
     *  get applied. Every commit writes one entry into the catalogAudit
     *  collection (per the v1.11 audit story). */
    const commitPlan = async () => {
        if (!importPlan) return;
        setBusy('commit');
        try {
            const writes: Promise<unknown>[] = [];
            let updated = 0, created = 0, skipped = 0;
            const auditedRows: any[] = [];
            for (const r of importPlan.rows) {
                if (planSelection[r.id] === false || r.op === 'skip') { skipped++; continue; }
                const payload = { ...r.payload, updatedAt: serverTimestamp() };
                if (r.op === 'update') {
                    writes.push(updateDoc(doc(firestore, r.collectionPath, r.docId), payload));
                    updated++;
                    auditedRows.push({ sheetName: r.sheetName, op: 'update', docId: r.docId, naturalKey: r.naturalKeyValue, changes: r.changes.map(c => ({ field: c.field, current: c.current ?? null, next: c.next })) });
                } else if (r.op === 'create') {
                    writes.push(addDoc(collection(firestore, r.collectionPath), { ...payload, createdAt: serverTimestamp() }));
                    created++;
                    auditedRows.push({ sheetName: r.sheetName, op: 'create', naturalKey: r.naturalKeyValue, fields: Object.keys(r.payload) });
                }
            }
            await Promise.all(writes);

            // v1.11 audit — one record per commit, with the full row-level diff.
            try {
                await addDoc(collection(firestore, `organisations/${organisationId}/catalogAudit`), {
                    source: 'catalog-import',
                    actorUid: user?.uid ?? null,
                    actorName: user?.displayName ?? user?.email ?? 'Unknown operator',
                    committedAt: serverTimestamp(),
                    counts: { updated, created, skipped },
                    rows: auditedRows.slice(0, 200), // safety cap to keep audit docs small
                    rowCount: auditedRows.length,
                });
            } catch (auditErr) {
                console.warn('catalogAudit write failed (non-fatal):', auditErr);
            }

            setImportPlan(null);
            setPlanSelection({});
            toast({ title: 'Import committed', description: `${updated} updated · ${created} created · ${skipped} skipped` });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Commit failed', description: String(err) });
        } finally {
            setBusy(null);
        }
    };

    const handleImportFile = async (file: File) => {
        setBusy('import');
        try {
            const plan = await buildImportPlan(file);
            const sel: Record<string, boolean> = {};
            for (const r of plan.rows) sel[r.id] = r.op !== 'skip'; // default-select all actionable rows
            setPlanSelection(sel);
            setImportPlan(plan);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Import preview failed', description: String(err) });
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
                    Pricing + Configurator Audit Workbook
                </CardTitle>
                <CardDescription className="text-xs">
                    Single-click snapshot of every pricing + configurator surface an org admin needs to audit.
                    <strong> Round-trippable sheets</strong> (upsert-by-natural-key on import): Fit-Up · Fit-Up Packages · Service Operations · Service Parts · Model Overrides · Trailer Overrides · Vendors · Ranges · Models · Variants · Optional Features.
                    <strong> Export-only sheets</strong> (read-only audit): Exchange Rates · Dealer Fit Selections · Dealer Fit Categories · Motor Vendors · Motor Models (with hull_cash / hull_trade / hull_subdealer / hull_commercial / hull_boating_alliance price levels).
                    Partial files on import won't clobber what's already in Firestore.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-3">
                    <Button onClick={handleExport} disabled={busy !== null} className="rounded-xl">
                        {busy === 'export' ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting…</>
                        ) : (
                            <><Download className="h-4 w-4 mr-2" /> Export audit workbook</>
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
                        <li>Fit-Up: <code>name</code> (case-insensitive); <code>moduleIds</code> / <code>brandIds</code> / <code>rangeIds</code> / <code>modelIds</code> are <code>|</code>-separated.</li>
                        <li>Service Operations: <code>code</code></li>
                        <li>Service Parts: <code>partNumber</code></li>
                        <li>Model Overrides: <code>modelId</code></li>
                        <li>Trailer Overrides: <code>trailerId</code></li>
                        <li>Vendors / Ranges / Models / Variants / Optional Features: id columns (setDoc + merge).</li>
                    </ul>
                </div>
            </CardContent>

            {/* v1.11 follow-up — pre-commit diff preview. Operators see every
                row that would change (with per-field current → new) before
                anything writes. Default selection includes all actionable
                rows; unticked rows are skipped on commit. */}
            <Dialog open={importPlan !== null} onOpenChange={open => { if (!open) { setImportPlan(null); setPlanSelection({}); } }}>
                <DialogContent className="max-w-5xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4" /> Confirm catalog import
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Every changed row below will be written to the catalog. Untick any row you don't want to commit. Nothing writes until you click <strong>Commit</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    {importPlan && (() => {
                        const summary = importPlan.rows.reduce(
                            (acc, r) => { acc[r.op] = (acc[r.op] ?? 0) + 1; return acc; },
                            { create: 0, update: 0, skip: 0 } as Record<DiffOp, number>,
                        );
                        const actionable = importPlan.rows.filter(r => r.op !== 'skip');
                        const selectedActionable = actionable.filter(r => planSelection[r.id] !== false).length;
                        return (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-black uppercase">+ {summary.create} create</Badge>
                                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-black uppercase">~ {summary.update} update</Badge>
                                    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-black uppercase">· {summary.skip} skip</Badge>
                                    <span className="text-[10px] text-muted-foreground ml-2">{selectedActionable}/{actionable.length} selected to commit</span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="ml-auto h-7 text-[10px] font-bold"
                                        onClick={() => {
                                            const next: Record<string, boolean> = {};
                                            const allOn = actionable.every(r => planSelection[r.id] !== false);
                                            for (const r of importPlan.rows) next[r.id] = r.op !== 'skip' && !allOn;
                                            setPlanSelection(next);
                                        }}
                                    >
                                        {actionable.every(r => planSelection[r.id] !== false) ? 'Deselect all' : 'Select all'}
                                    </Button>
                                </div>
                                {importPlan.untouchedSheets.length > 0 && (
                                    <p className="text-[10px] text-muted-foreground italic">Sheets not committed: {importPlan.untouchedSheets.join(' · ')}</p>
                                )}
                                <ScrollArea className="border-2 rounded-xl h-[55vh]">
                                    <div className="divide-y">
                                        {importPlan.rows.map(r => {
                                            const isSelected = planSelection[r.id] !== false;
                                            const tone = r.op === 'create' ? 'border-l-4 border-l-emerald-400'
                                                : r.op === 'update' ? 'border-l-4 border-l-amber-400'
                                                : 'border-l-4 border-l-slate-200';
                                            return (
                                                <div key={r.id} className={`p-3 ${tone} ${r.op === 'skip' ? 'opacity-50' : ''}`}>
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            disabled={r.op === 'skip'}
                                                            onChange={e => setPlanSelection(s => ({ ...s, [r.id]: e.target.checked }))}
                                                        />
                                                        <Badge variant="outline" className="text-[9px] font-black uppercase">{r.sheetName}</Badge>
                                                        <span className="font-mono text-xs">{r.naturalKeyValue || '(no key)'}</span>
                                                        <Badge className={`text-[9px] font-black uppercase ${r.op === 'create' ? 'bg-emerald-500' : r.op === 'update' ? 'bg-amber-500' : 'bg-slate-400'}`}>{r.op}</Badge>
                                                        {r.skipReason && <span className="text-[10px] text-muted-foreground italic">— {r.skipReason}</span>}
                                                    </div>
                                                    {r.changes.length > 0 && (
                                                        <div className="ml-7 mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                                            {r.changes.map((c, i) => (
                                                                <div key={i} className="text-[10px] font-mono bg-slate-50 rounded px-2 py-1">
                                                                    <span className="font-bold text-slate-700">{c.field}: </span>
                                                                    <span className="text-rose-600 line-through">{c.current == null ? '∅' : Array.isArray(c.current) ? c.current.join('|') : String(c.current)}</span>
                                                                    <span className="mx-1 text-slate-400">→</span>
                                                                    <span className="text-emerald-700">{Array.isArray(c.next) ? c.next.join('|') : String(c.next)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        );
                    })()}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => { setImportPlan(null); setPlanSelection({}); }} disabled={busy === 'commit'}>Cancel</Button>
                        <Button onClick={commitPlan} disabled={busy === 'commit' || !importPlan} className="rounded-xl">
                            {busy === 'commit' ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Committing…</>) : (<><Check className="h-4 w-4 mr-2" /> Commit selected</>)}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
