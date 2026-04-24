/**
 * Seed Script: Trailers Module
 * =============================
 * Parses `tasks/v1.4-trailers-source/Trailer Module.xlsx` and produces either
 * a dry-run plan (default) or writes brand vendors, series sub-collections and
 * trailer docs to Firestore (`--live`).
 *
 * Usage:
 *   # Dry-run — writes /tmp/trailer-import-plan.json
 *   npx tsx scripts/seed-trailers.ts
 *
 *   # Override xlsx path (useful in sandbox where LFS pointer sits in repo)
 *   npx tsx scripts/seed-trailers.ts --file=/tmp/trailer.xlsx
 *
 *   # Live — writes to Firestore via firebase-admin
 *   npx tsx scripts/seed-trailers.ts --live --file=/path/to/Trailer\ Module.xlsx
 *
 * The script is idempotent — re-running with --live upserts existing docs
 * (keyed by brand slug, series slug, trailer code).
 *
 * See tasks/v1.4-trailers-module-design.md §8 for the full schema.
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');
const fileArg = argv.find(a => a.startsWith('--file='));
const DEFAULT_PATH = path.join(__dirname, '..', 'tasks', 'v1.4-trailers-source', 'Trailer Module.xlsx');
const XLSX_PATH = fileArg ? fileArg.replace('--file=', '') : DEFAULT_PATH;
const PLAN_PATH = '/tmp/trailer-import-plan.json';

// ---------------------------------------------------------------------------
// Column indices (0-based)
// ---------------------------------------------------------------------------

const COL = {
    NAME: 2, SUPPLIER: 3, CODE: 4, LONG_DESC: 5, IMAGE: 6,
    BOAT_SIZE: 7, WHEEL: 8, TARE: 9, ATM: 10, WINCH: 11,
    BETWEEN_GUARDS: 12, LENGTH: 13, PLUG: 14,
    FEATURES_START: 17, FEATURES_END: 37,            // R..AL (21 cols)
    DEALER: 39, DISCOUNT: 40, SETTLEMENT: 41, NETT: 42, FREIGHT: 43, LANDED: 44,
    FACTORY_LEAD_DAYS: 46, LOCKOUT: 47, BUILD: 48, COMPLETION: 49, SHIPPING: 50, EST_LEAD: 51,
    PD_OP: 53, PD_HRS: 54, PD_DOLLARS: 55,
    PD_PARTS_START: 56,                               // BE..BN pairs of (name, cost) × 5
    SUNDRY: 66, DETAILING: 67, TOTAL_PD: 68,
    TOTAL_NETT_CTD: 70, MU_PCT: 71, GP: 72, RRP: 73, SELL: 74,
    REGO_TYPE: 76, REGO_DOLLARS: 77, SELL_INC_REGO: 78,
    FACTORY_OPT_START: 81,                            // CD onward — 20 × 4 = 80 cols
    FACTORY_OPT_COUNT: 20,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportPlan {
    xlsxPath: string;
    generatedAt: string;
    totals: {
        brands: number;
        series: number;
        trailers: number;
        skipped: number;
        withCode: number;
        withOptions: number;
    };
    brands: BrandPlan[];
    warnings: string[];
    sample: TrailerDoc[];                             // First 5 trailers for eyeball inspection
}

interface BrandPlan {
    vendorId: string;
    name: string;
    shortCode: string;
    seriesCount: number;
    trailerCount: number;
    series: SeriesPlan[];
}

interface SeriesPlan {
    seriesId: string;
    name: string;
    order: number;
    trailerCount: number;
    trailerCodes: string[];
}

interface TrailerDoc {
    vendorId: string;
    seriesId: string;
    trailerId: string;
    code: string;
    name: string;
    supplier?: string;
    longDescription?: string;
    imageUrl?: string;
    isActive: boolean;
    specifications: Record<string, any>;
    features: string[];
    cost: number;
    sellPriceExclGst: number;
    landedCost: number;
    pricingDetail: Record<string, any>;
    optionalFeatures: Array<{ id: string; name: string; description: string; cost: number; sellExclGst: number }>;
    leadTimes: Record<string, any>;
    sourceRow: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slug(s: string): string {
    return s.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

function cleanStr(v: any): string {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim();
}

function toNum(v: any): number {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
}

function toNumOrNull(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
}

function cellVal(ws: XLSX.WorkSheet, r: number, c: number): any {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    return cell?.v;
}

// Known brand markers — ALL CAPS rows that end the previous brand's series list.
const BRAND_PATTERNS: Array<{ match: RegExp; vendorId: string; name: string; shortCode: string }> = [
    { match: /^GFAB\b/i,                       vendorId: 'gfab-trailers',            name: 'GFAB Trailers',            shortCode: 'GFAB' },
    { match: /^STACER\b/i,                     vendorId: 'stacer-trailers',          name: 'STACER Trailers',          shortCode: 'STACER' },
    { match: /^DUNBIER\s*\/\s*HAINES/i,        vendorId: 'dunbier-haines-bmt',        name: 'DUNBIER / HAINES BMT Trailers', shortCode: 'DUN-HAINES' },
    { match: /^DUNBIER\b/i,                    vendorId: 'dunbier-trailers',         name: 'DUNBIER Trailers',         shortCode: 'DUNBIER' },
    { match: /^MACKAY\b/i,                     vendorId: 'mackay-trailers',          name: 'MACKAY Trailers',          shortCode: 'MACKAY' },
    { match: /^NSM\s*CUSTOM/i,                 vendorId: 'nsm-custom-trailers',       name: 'NSM Custom Trailers',      shortCode: 'NSM' },
    { match: /^OBSOLETE\s+TRAILERS/i,          vendorId: 'obsolete-trailers',         name: 'Obsolete Trailers',        shortCode: 'OBS' },
    { match: /^TRAILER\s+NOT\s+REQUIRED/i,     vendorId: 'trailer-not-required',      name: 'Trailer Not Required',     shortCode: 'NONE' },
];

// Default brand for the top of the file (REDCO + TINKA combined per client spec).
const DEFAULT_BRAND = { vendorId: 'redco-tinka-trailers', name: 'REDCO / TINKA Trailers', shortCode: 'REDCO-TINKA' };

function detectBrand(rowText: string): { vendorId: string; name: string; shortCode: string } | null {
    const upper = rowText.toUpperCase();
    if (!/TRAILERS?/.test(upper)) return null;
    for (const p of BRAND_PATTERNS) {
        if (p.match.test(upper)) return { vendorId: p.vendorId, name: p.name, shortCode: p.shortCode };
    }
    return null;
}

function isTrailerRow(code: string): boolean {
    if (!code) return false;
    // Row 3 is a manual index row "1, 2, 3..." — skip short all-digit "codes"
    if (/^\d{1,3}$/.test(code)) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function parseXlsx(filePath: string): { plan: ImportPlan; trailers: TrailerDoc[] } {
    if (!fs.existsSync(filePath)) {
        throw new Error(`xlsx file not found: ${filePath}`);
    }

    console.log(`Reading ${filePath}...`);
    const wb = XLSX.readFile(filePath, { cellDates: true });
    const ws = wb.Sheets['Trailer Module'];
    if (!ws) throw new Error('Sheet "Trailer Module" not found in workbook');

    const range = XLSX.utils.decode_range(ws['!ref']!);
    console.log(`  Range: ${ws['!ref']} (${range.e.r + 1} rows × ${range.e.c + 1} cols)`);

    const warnings: string[] = [];
    const brandMap = new Map<string, BrandPlan>();
    const trailers: TrailerDoc[] = [];

    // Start at row 3 (0-indexed 3) — skip header + blank + numeric index
    let currentBrand = { ...DEFAULT_BRAND };
    let currentSeries: { seriesId: string; name: string; order: number } | null = null;
    let seriesOrderInBrand = new Map<string, number>();
    let skipped = 0;
    let currentActive = true;

    for (let r = 3; r <= range.e.r; r++) {
        const nameCell = cleanStr(cellVal(ws, r, COL.NAME));
        const codeCell = cleanStr(cellVal(ws, r, COL.CODE));

        // Blank row
        if (!nameCell && !codeCell) continue;

        // Row without code → brand header OR series header
        if (nameCell && !codeCell) {
            const brandSwitch = detectBrand(nameCell);
            if (brandSwitch) {
                currentBrand = brandSwitch;
                currentSeries = null;
                // Obsolete + "Not Required" sections get isActive: false
                currentActive = !/OBSOLETE|NOT\s+REQUIRED/i.test(nameCell);
            } else {
                // Series header — tie to current brand
                const sId = slug(nameCell);
                const order = (seriesOrderInBrand.get(currentBrand.vendorId) ?? 0) + 1;
                seriesOrderInBrand.set(currentBrand.vendorId, order);
                currentSeries = { seriesId: sId, name: nameCell, order };
            }
            continue;
        }

        // Trailer row
        if (!isTrailerRow(codeCell)) {
            skipped++;
            continue;
        }

        // Defensive: if the slug of the code is empty (e.g. the cell is just
        // punctuation), we'd produce a path ending in "/trailers/" which
        // Firestore rejects. Warn and skip.
        const trailerIdSlug = slug(codeCell);
        if (!trailerIdSlug) {
            warnings.push(`Row ${r + 1}: trailer code "${codeCell}" slugs to empty string — skipped`);
            skipped++;
            continue;
        }

        if (!currentSeries) {
            warnings.push(`Row ${r + 1}: trailer code "${codeCell}" with no preceding series header; assigned to "Unsorted" under ${currentBrand.name}`);
            currentSeries = { seriesId: 'unsorted', name: 'Unsorted', order: 0 };
        }

        // Collect features (21 cols)
        const features: string[] = [];
        for (let c = COL.FEATURES_START; c <= COL.FEATURES_END; c++) {
            const f = cleanStr(cellVal(ws, r, c));
            if (f && f !== '.') features.push(f);
        }

        // Collect optional features (20 slots × 4 cols: Name, Description, Cost, Sell)
        const optionalFeatures: TrailerDoc['optionalFeatures'] = [];
        for (let i = 0; i < COL.FACTORY_OPT_COUNT; i++) {
            const base = COL.FACTORY_OPT_START + i * 4;
            const nm = cleanStr(cellVal(ws, r, base));
            const desc = cleanStr(cellVal(ws, r, base + 1));
            const cost = toNum(cellVal(ws, r, base + 2));
            const sell = toNum(cellVal(ws, r, base + 3));
            if (nm && nm !== '.') {
                optionalFeatures.push({
                    id: slug(nm),
                    name: nm,
                    description: desc,
                    cost,
                    sellExclGst: sell,
                });
            }
        }

        // PD parts (5 pairs — name, cost)
        const pdParts: Array<{ name: string; cost: number }> = [];
        for (let i = 0; i < 5; i++) {
            const nm = cleanStr(cellVal(ws, r, COL.PD_PARTS_START + i * 2));
            const cost = toNum(cellVal(ws, r, COL.PD_PARTS_START + i * 2 + 1));
            if (nm && nm !== '.') pdParts.push({ name: nm, cost });
        }

        const totalNettCtd = toNum(cellVal(ws, r, COL.TOTAL_NETT_CTD));
        const sell = toNum(cellVal(ws, r, COL.SELL));
        const landed = toNum(cellVal(ws, r, COL.LANDED));

        const trailer: TrailerDoc = {
            vendorId: currentBrand.vendorId,
            seriesId: currentSeries.seriesId,
            trailerId: slug(codeCell),
            code: codeCell,
            name: nameCell,
            supplier: cleanStr(cellVal(ws, r, COL.SUPPLIER)) || undefined,
            longDescription: cleanStr(cellVal(ws, r, COL.LONG_DESC)) || undefined,
            imageUrl: cleanStr(cellVal(ws, r, COL.IMAGE)) || undefined,
            isActive: currentActive,
            specifications: {
                boatSizeMtr: toNumOrNull(cellVal(ws, r, COL.BOAT_SIZE)),
                wheelSize: cleanStr(cellVal(ws, r, COL.WHEEL)),
                tareKg: toNumOrNull(cellVal(ws, r, COL.TARE)),
                atmKg: toNumOrNull(cellVal(ws, r, COL.ATM)),
                winch: cleanStr(cellVal(ws, r, COL.WINCH)),
                betweenGuardsMm: toNumOrNull(cellVal(ws, r, COL.BETWEEN_GUARDS)),
                lengthMtr: toNumOrNull(cellVal(ws, r, COL.LENGTH)),
                plug: cleanStr(cellVal(ws, r, COL.PLUG)),
            },
            features,
            cost: totalNettCtd,
            sellPriceExclGst: sell,
            landedCost: landed,
            pricingDetail: {
                dealer: toNum(cellVal(ws, r, COL.DEALER)),
                discount: toNumOrNull(cellVal(ws, r, COL.DISCOUNT)),
                settlement: toNumOrNull(cellVal(ws, r, COL.SETTLEMENT)),
                nettPrice: toNum(cellVal(ws, r, COL.NETT)),
                freight: toNum(cellVal(ws, r, COL.FREIGHT)),
                landed,
                pdOperation: cleanStr(cellVal(ws, r, COL.PD_OP)),
                pdHours: toNum(cellVal(ws, r, COL.PD_HRS)),
                pdDollars: toNum(cellVal(ws, r, COL.PD_DOLLARS)),
                pdParts,
                sundry: toNum(cellVal(ws, r, COL.SUNDRY)),
                detailing: toNum(cellVal(ws, r, COL.DETAILING)),
                totalPdCharges: toNum(cellVal(ws, r, COL.TOTAL_PD)),
                totalNettCtd,
                markupPercent: toNum(cellVal(ws, r, COL.MU_PCT)),
                grossProfit: toNum(cellVal(ws, r, COL.GP)),
                rrp: toNum(cellVal(ws, r, COL.RRP)),
                sell,
                regoTypeHint: cleanStr(cellVal(ws, r, COL.REGO_TYPE)),
                regoDollarsHint: toNum(cellVal(ws, r, COL.REGO_DOLLARS)),
                sellIncRegoHint: toNum(cellVal(ws, r, COL.SELL_INC_REGO)),
            },
            optionalFeatures,
            leadTimes: {
                factoryLeadDays: toNum(cellVal(ws, r, COL.FACTORY_LEAD_DAYS)),
                estimatedLeadDays: toNum(cellVal(ws, r, COL.EST_LEAD)),
            },
            sourceRow: r + 1,
        };

        trailers.push(trailer);

        // Track under brand/series plan
        if (!brandMap.has(currentBrand.vendorId)) {
            brandMap.set(currentBrand.vendorId, {
                vendorId: currentBrand.vendorId,
                name: currentBrand.name,
                shortCode: currentBrand.shortCode,
                seriesCount: 0,
                trailerCount: 0,
                series: [],
            });
        }
        const brandPlan = brandMap.get(currentBrand.vendorId)!;
        let seriesPlan = brandPlan.series.find(s => s.seriesId === currentSeries!.seriesId);
        if (!seriesPlan) {
            seriesPlan = {
                seriesId: currentSeries!.seriesId,
                name: currentSeries!.name,
                order: currentSeries!.order,
                trailerCount: 0,
                trailerCodes: [],
            };
            brandPlan.series.push(seriesPlan);
            brandPlan.seriesCount++;
        }
        seriesPlan.trailerCount++;
        seriesPlan.trailerCodes.push(codeCell);
        brandPlan.trailerCount++;
    }

    const plan: ImportPlan = {
        xlsxPath: filePath,
        generatedAt: new Date().toISOString(),
        totals: {
            brands: brandMap.size,
            series: [...brandMap.values()].reduce((sum, b) => sum + b.seriesCount, 0),
            trailers: trailers.length,
            skipped,
            withCode: trailers.length,
            withOptions: trailers.filter(t => t.optionalFeatures.length > 0).length,
        },
        brands: [...brandMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
        warnings,
        sample: trailers.slice(0, 5),
    };

    return { plan, trailers };
}

// ---------------------------------------------------------------------------
// Firestore write (live mode)
// ---------------------------------------------------------------------------
//
// Uses the Firestore REST API + anonymous auth (same pattern as
// scripts/reseed-correct-vendor.py). This avoids needing a service-account
// JSON in the sandbox. Rules allow any signed-in user to write to
// `data-warehouse/**` and `/modules/{moduleId}`, so anonymous sign-in is
// sufficient for a seed.
// ---------------------------------------------------------------------------

const PROJECT_ID = 'studio-2290360004-3b963';
const API_KEY = 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Convert JS value to a Firestore REST "Value" representation.
function toFsVal(v: any): any {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
        if (Number.isInteger(v)) return { integerValue: String(v) };
        return { doubleValue: v };
    }
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) {
        return { arrayValue: { values: v.map(toFsVal) } };
    }
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === 'object') {
        const fields: Record<string, any> = {};
        for (const [k, val] of Object.entries(v)) {
            if (val !== undefined) fields[k] = toFsVal(val);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

function toFsDoc(data: Record<string, any>): any {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) fields[k] = toFsVal(v);
    }
    return { fields };
}

async function getAnonymousToken(): Promise<string> {
    const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnSecureToken: true }),
        },
    );
    if (!resp.ok) {
        throw new Error(`Auth failed: ${resp.status} ${await resp.text()}`);
    }
    const json: any = await resp.json();
    return json.idToken;
}

async function fsPatch(token: string, path: string, data: Record<string, any>): Promise<void> {
    // PATCH with no updateMask creates or fully replaces the doc.
    // We add updateMask to only touch the keys in `data` (merge: true behaviour).
    const maskParams = Object.keys(data)
        .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
        .join('&');
    const url = `${FS_BASE}/${path}?${maskParams}`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(toFsDoc(data)),
    });
    if (!resp.ok) {
        throw new Error(`PATCH ${path} failed: ${resp.status} ${await resp.text()}`);
    }
}

async function writeLive(trailers: TrailerDoc[], plan: ImportPlan) {
    console.log(`\nLIVE MODE — writing to Firestore (project: ${PROJECT_ID}) via REST`);

    const token = await getAnonymousToken();
    console.log(`  Authenticated (anonymous) — idToken obtained`);

    const now = new Date();

    // 1. Upsert brand vendors
    for (const brand of plan.brands) {
        console.log(`\nBrand: ${brand.name} (${brand.vendorId})`);
        await fsPatch(token, `data-warehouse/${brand.vendorId}`, {
            name: brand.name,
            slug: brand.vendorId,
            shortCode: brand.shortCode,
            vendorType: 'Trailer Brand',
            dataSource: 'Document Upload',
            currency: 'AUD',
            logoUrl: null,
            updatedAt: now,
        });

        // 2. Upsert series
        for (const series of brand.series) {
            await fsPatch(token, `data-warehouse/${brand.vendorId}/series/${series.seriesId}`, {
                name: series.name,
                slug: series.seriesId,
                order: series.order,
                isActive: true,
                updatedAt: now,
            });
        }
        console.log(`  ${brand.seriesCount} series · ${brand.trailerCount} trailers`);
    }

    // 3. Upsert trailers — REST has no true batch, so we parallelise in chunks
    console.log(`\nWriting ${trailers.length} trailer docs...`);
    const CONCURRENCY = 8;
    let done = 0;
    for (let i = 0; i < trailers.length; i += CONCURRENCY) {
        const chunk = trailers.slice(i, i + CONCURRENCY);
        await Promise.all(
            chunk.map(async (t) => {
                const { vendorId, seriesId, trailerId, ...data } = t;
                await fsPatch(
                    token,
                    `data-warehouse/${vendorId}/series/${seriesId}/trailers/${trailerId}`,
                    { ...data, importedAt: now, importedFromFile: 'Trailer Module.xlsx' },
                );
            }),
        );
        done += chunk.length;
        if (done % 40 === 0 || done === trailers.length) {
            console.log(`  ${done}/${trailers.length} trailers written`);
        }
    }

    console.log('\n✓ Live import complete.');
    console.log(`\nNext step: create a Trailers module document referencing these brand vendor IDs:`);
    console.log(`  ${plan.brands.map(b => b.vendorId).join('\n  ')}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log(`Trailers importer — ${LIVE ? 'LIVE' : 'DRY-RUN'} mode\n`);

    const { plan, trailers } = parseXlsx(XLSX_PATH);

    fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    console.log(`\nImport plan written to ${PLAN_PATH}`);
    console.log(`\nTotals:`);
    console.log(`  Brands: ${plan.totals.brands}`);
    console.log(`  Series: ${plan.totals.series}`);
    console.log(`  Trailers: ${plan.totals.trailers}`);
    console.log(`  With factory options: ${plan.totals.withOptions}`);
    console.log(`  Skipped rows: ${plan.totals.skipped}`);
    if (plan.warnings.length > 0) {
        console.log(`\nWarnings (${plan.warnings.length}):`);
        plan.warnings.slice(0, 10).forEach(w => console.log(`  - ${w}`));
        if (plan.warnings.length > 10) console.log(`  ... and ${plan.warnings.length - 10} more (see ${PLAN_PATH})`);
    }
    console.log(`\nBrands:`);
    plan.brands.forEach(b => console.log(`  - ${b.name}: ${b.seriesCount} series, ${b.trailerCount} trailers`));

    if (!LIVE) {
        console.log(`\n→ Re-run with --live to write to Firestore.`);
        return;
    }

    await writeLive(trailers, plan);
}

main().catch(err => {
    console.error('\n✗ Import failed:', err);
    process.exit(1);
});
