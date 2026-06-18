/**
 * importer-registry.ts (v1.17 — Story 3.11.3).
 *
 * Per-vendor importer plug-in registry. Standardises the v1.10/v1.11
 * Yamaha MPF importer, the v1.11 Sam Allen rigging importer, and the
 * v1.4 trailer importer into a single registry pattern so onboarding a
 * new vendor doesn't touch the catalog component.
 *
 * Shape: each importer declares its identity, the column map from the
 * source spreadsheet to the canonical catalog row, the natural key column
 * (per the v1.4 lesson — upsert-by-key, never clear-and-replace), and an
 * optional row-level transformer for quirks (Yamaha multi-engine 'N × HP'
 * syntax, Sam Allen part-number prefixes, etc.).
 *
 * The MasterPriceFileWorkspace + paste-from-spreadsheet dialog pick the
 * right importer from the active vendor row via getImporterForVendor().
 */

export type ImporterColumnMap = Record<string, string>;

export interface VendorImporter {
    /** Stable identifier — used in audit-log entries. */
    id: string;
    /** Display label in the UI. */
    label: string;
    /** Vendor slug or id this importer is for. */
    vendorMatch: (vendor: { id: string; slug?: string; vendorType?: string }) => boolean;
    /** Source-column → canonical-field map. Source columns are matched
     *  case-insensitively, whitespace-normalised. */
    columnMap: ImporterColumnMap;
    /** Natural key column on the canonical row. Per the v1.4 lesson.
     *  Examples: 'Part Number' for motors, 'Code' for trailers. */
    keyColumn: string;
    /** Optional per-row transformer applied after column-mapping. Use it
     *  to coerce types, split compound fields, etc. */
    transformer?: (row: Record<string, any>) => Record<string, any>;
    /** Target Firestore collection path segments under data-warehouse. */
    targetCollection: (vendorId: string) => string[];
}

const registry: VendorImporter[] = [];

export function registerImporter(importer: VendorImporter): void {
    // Idempotent — re-registering the same id replaces the old entry.
    const existing = registry.findIndex(r => r.id === importer.id);
    if (existing >= 0) registry[existing] = importer;
    else registry.push(importer);
}

export function getImporterForVendor(vendor: { id: string; slug?: string; vendorType?: string }): VendorImporter | null {
    for (const importer of registry) if (importer.vendorMatch(vendor)) return importer;
    return null;
}

export function listImporters(): VendorImporter[] {
    return [...registry];
}

// ----------------------------------------------------------------------
// Default importers shipped with v1.17. Adding a new vendor in v1.18+
// is just another registerImporter() call.
// ----------------------------------------------------------------------

registerImporter({
    id: 'yamaha-mpf',
    label: 'Yamaha Master Price File',
    vendorMatch: v => v.slug === 'yamaha' || /yamaha/i.test(v.vendorType ?? ''),
    columnMap: {
        'Part Number': 'Part Number',
        'Model Name': 'Model Name',
        'HP Rating': 'HP Rating',
        'Series': 'Series',
        'Shaft': 'Shaft',
        'NSM Retail': 'priceLevels.hull_cash',
        'Trade Price': 'priceLevels.hull_trade',
        'Commercial Price': 'priceLevels.hull_commercial',
        'Boating Alliance Price': 'priceLevels.hull_boating_alliance',
        'Act CTD': 'cost',
        'Act Sell': 'sellPriceExclGst',
    },
    keyColumn: 'Part Number',
    targetCollection: (vendorId) => ['data-warehouse', vendorId, 'parts'],
});

registerImporter({
    id: 'sam-allen-rigging',
    label: 'Sam Allen Rigging Catalogue',
    vendorMatch: v => v.slug === 'sam-allen' || /sam[- ]allen/i.test(v.vendorType ?? ''),
    columnMap: {
        'Part Number': 'Part Number',
        'Description': 'Model Name',
        'Cost': 'cost',
        'Sell': 'sellPriceExclGst',
    },
    keyColumn: 'Part Number',
    targetCollection: (vendorId) => ['data-warehouse', vendorId, 'parts'],
});

registerImporter({
    id: 'trailer-brand',
    label: 'Trailer brand pricing',
    vendorMatch: v => v.vendorType === 'Trailer Brand',
    columnMap: {
        'Code': 'code',
        'Name': 'name',
        'ATM': 'specifications.atmKg',
        'Tare': 'specifications.tareKg',
        'Wheels': 'specifications.wheelSize',
        'Cost': 'cost',
        'Sell': 'sellPriceExclGst',
    },
    keyColumn: 'Code',
    targetCollection: (vendorId) => ['data-warehouse', vendorId, 'trailers'],
});
