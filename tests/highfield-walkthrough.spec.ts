/**
 * highfield-walkthrough.spec.ts — walk EVERY Highfield boat end-to-end
 * (Steps 1→6) asserting, per step, that the UI renders exactly the MPF
 * boat-row connections from the LIVE Firestore docs (fixture.json is a
 * read-only snapshot extracted minutes before the run):
 *
 *   Step 1 — every colour/material variant clickable; the build total
 *            reflects each variant's live hull_cash price (delta-exact);
 *            rego section renders; auto-matched rego == regoTypes doc.
 *   Step 2 — every factory-option card's price == option.sellPriceExclGst
 *            on the effective (override-merged) model doc.
 *   Step 3 — NSM Recommended cards == variant.motorMenu slots exactly
 *            (count + names); each card shows its rigging kit + prop; each
 *            resolved card's price == Yamaha row's hull_cash (NSM Retail
 *            basis — see fetchMotors priceLevels build in the quote flow).
 *   Step 4 — NSM recommended trailer chips == variant.trailerMenu; every
 *            assignment card, when selected, shows the live trailer doc's
 *            effective sell (org/parent trailerOverrides honoured).
 *   Step 5 — recommended strip == variant.dealerFitLines; NO '###' /
 *            OBSELETE / other-range pack categories visible (FFR-18/19);
 *            every rendered dealer-fit card's price == Act Sell chain;
 *            fit-up selector mounts and the first 10 context-matched
 *            fitUpItems render their catalog sellPrice.
 *   Step 6 — Base Vessel / Powertrain / Towing lines == live doc prices;
 *            header total == sum of picks (±$2 float-rounding band).
 *
 * Results stream to tasks/test-evidence/highfield-walk/results.json
 * (flushed per model) + WALKTHROUGH.md matrix. Failures screenshot into
 * tasks/test-evidence/highfield-walk/fails/ and the walk continues.
 *
 * Part 2 (separate describe, video ON) — the polished SP560 walkthrough
 * recorded for the stakeholder video.
 */
import { test, expect, Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';
import path from 'path';

const OUT = 'tasks/test-evidence/highfield-walk';
const FAILS = path.join(OUT, 'fails');
fs.mkdirSync(FAILS, { recursive: true });

const FX = JSON.parse(fs.readFileSync(path.join(OUT, 'fixture.json'), 'utf8'));
const MODULE_ID: string = FX.moduleId;
const VENDOR_ID: string = FX.vendorId;

test.describe.configure({ retries: 0 });
// Video/trace must be file-level (a describe-level use() forces new workers).
// Part 1 runs dark; Part 2 records its video via an explicit recordVideo
// context so the walkthrough video is the ONLY video artifact produced.
test.use({ viewport: { width: 1440, height: 900 }, video: 'off', trace: 'off' });

/* ================= replicas of app pricing/matching logic ================= */

const PRICE_FALLBACK_FIELDS = ['sellPriceExclGst', 'Act Sell', 'Sell Price', 'Store Price', 'NSM Retail', 'PARTS', 'RRP', 'Price', 'Retail', 'Trade'];
const PRICE_LADDER_LEVEL_MAP: Record<string, string> = {
    hull_trade: 'trade', hull_subdealer: 'subDealer', hull_subdealer_excl: 'subExclusive', hull_aus_sailing: 'ausSailing',
};
function coerceNumber(v: any): number | null {
    if (v == null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
    return null;
}
function resolvePriceLevel(item: any, level: string): number {
    if (!item) return 0;
    if (level && level !== 'default' && item?.priceLevels) {
        const c = coerceNumber(item.priceLevels[level]);
        if (c !== null) return c;
    }
    for (const f of PRICE_FALLBACK_FIELDS) {
        const c = coerceNumber(item[f]);
        if (c !== null) return c;
    }
    return 0;
}
function getPriceForLevel(item: any, level = 'hull_cash'): number {
    const ladderKey = PRICE_LADDER_LEVEL_MAP[level];
    if (ladderKey) {
        const exGst = item?.priceLadder?.[ladderKey]?.exGst;
        if (typeof exGst === 'number' && Number.isFinite(exGst)) return exGst;
    }
    return resolvePriceLevel(item, level);
}
const fmtN = (v: number) => v.toLocaleString('en-US'); // matches bare .toLocaleString() in Chromium (en-US)
function formatCurrency(value: number): string {
    if (value === null || value === undefined || isNaN(value)) return '$0';
    const decimals = Number.isInteger(value) ? 0 : 2;
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** page.tsx getEffectiveModel replica (master + org modelOverride merge). */
function getEffectiveModel(master: any, override: any) {
    if (!master) return null;
    if (!override) return master;
    const merged = { ...master, ...override };
    if (master.optionalFeatures && Array.isArray(master.optionalFeatures)) {
        const overrideFeatures = override.optionalFeatures || [];
        const overrideMap = new Map(overrideFeatures.map((f: any) => [f.id, f]));
        const mergedFeatures = master.optionalFeatures.map((mf: any) => {
            const of = overrideMap.get(mf.id);
            return of ? { ...mf, ...(of as any) } : mf;
        });
        const masterIds = new Set(master.optionalFeatures.map((f: any) => f.id));
        overrideFeatures.forEach((of: any) => { if (!masterIds.has(of.id)) mergedFeatures.push(of); });
        merged.optionalFeatures = mergedFeatures;
    }
    return merged;
}

/** quote-flow formatOptionDisplayLabel replica. */
function formatOptionDisplayLabel(name: string): { base: string; color: string | null } {
    const stripped = String(name || '').replace(/\s+FOR\s+[A-Z]{2,3}\d{3,}/gi, '').trim();
    const normalized = stripped.replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim();
    const parenMatch = normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!parenMatch) return { base: normalized, color: null };
    return { base: parenMatch[1].trim(), color: parenMatch[2].split('/')[0].trim() || null };
}

const HARDWARE_BLOCKLIST = ['MOTOR', 'ENGINE', 'FUEL', 'TRAILER', 'OUTBOARD', 'RAM SUPPORT', 'PROP'];
/** relevantFeatures + groupedOptions + Seats-rules replica → the option
 *  cards Step 2 actually renders (no console selected → Seats hidden). */
function expectedStep2Options(model: any, variant: any, material: string | null): any[] {
    const features = model.optionalFeatures || [];
    const relevant = features.filter((f: any) => {
        const name = String(f.name).toUpperCase();
        if (HARDWARE_BLOCKLIST.some(k => name.includes(k))) return false;
        if (f.applicableVariantIds?.length && !f.applicableVariantIds.includes(variant.id)) return false;
        if (f.associatedSkus?.length && variant.sku && !f.associatedSkus.includes(variant.sku)) return false;
        if (material === 'PVC' && name.includes('HYP')) return false;
        if (material === 'HYP' && name.includes('PVC')) return false;
        return true;
    });
    // no console is ever selected during the walk → the Seats category never renders cards
    return relevant.filter((f: any) => (f.category || 'General Options') !== 'Seats');
}

/** fetchMotors replica — Yamaha rows mapped + HP-filtered for this model. */
function buildMotorsForModel(model: any): any[] {
    const rows = (FX.motorRows || []).map((raw: any) => {
        const row: any = { ...raw };
        const p = (v: any) => (typeof v === 'number' ? v : parseFloat(v) || 0);
        const nsmRetail = p(row['NSM Retail']), sellPrice = p(row['Sell Price']), storePrice = p(row['Store Price']);
        const tradePrice = p(row['Trade Price']);
        row.sellPriceExclGst = storePrice || nsmRetail || sellPrice || 0;
        row.priceLevels = {
            hull_cash: nsmRetail || storePrice || sellPrice || 0,
            hull_trade: tradePrice || 0, hull_subdealer: tradePrice || 0, hull_subdealer_excl: tradePrice || 0,
            hull_commercial: p(row['Commercial Price']) || 0, hull_boating_alliance: p(row['Boating Alliance Price']) || 0,
        };
        if (row.masterAccessories) {
            row.masterAccessories = row.masterAccessories.map((acc: any) => {
                const accSell = p(acc['Act Sell'] || acc.sellPriceExclGst || acc['Store Price'] || acc['Sell Price'] || acc.price);
                return { ...acc, sellPriceExclGst: accSell || 0 };
            });
        }
        return row;
    });
    const parseHpRating = (rating: any): { count: number; hp: number } | null => {
        if (!rating) return null;
        const str = String(rating).toLowerCase().trim();
        const twin = str.match(/^(\d+)\s*x\s*(\d+)/);
        if (twin) return { count: parseInt(twin[1]), hp: parseInt(twin[2]) };
        const single = str.match(/^(\d+)/);
        return single ? { count: 1, hp: parseInt(single[1]) } : null;
    };
    const motorConfigs = model.specifications?.motorConfigurations || [];
    if (motorConfigs.length === 0) return [];
    const config = motorConfigs[0];
    const spec = config.engines?.[0];
    const minHp = Number(spec?.minHp || 0), maxHp = Number(spec?.maxHp || 0);
    const targetEngineCount = ({ Single: 1, Twin: 2, Triple: 3, Quad: 4 } as any)[config.type || 'Single'] || 1;
    const overrides = model.motorOverrides?.[config.type || 'Single'] || { hiddenIds: [], manualIds: [] };
    const manual = rows.filter((r: any) => overrides.manualIds?.includes(r.id));
    const filtered = rows.filter((r: any) => {
        if (overrides.hiddenIds?.includes(r.id)) return false;
        const parsed = parseHpRating(r['HP Rating']);
        if (!parsed) return false;
        if (parsed.count !== targetEngineCount) return false;
        if (maxHp > 0) { if (parsed.hp < minHp || parsed.hp > maxHp) return false; }
        else if (parsed.hp < minHp) return false;
        return true;
    });
    return [...new Map([...filtered, ...manual].map((m: any) => [m.id, m])).values()];
}
function getMotorDisplayName(m: any): string {
    const vendor = (FX.motorVendor?.name || 'YAMAHA').toUpperCase();
    const keys = Object.keys(m || {});
    const norm = (s: string) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');
    const nameKey = keys.find(k => ['modelname', 'model', 'description', 'name'].includes(norm(k)));
    let name = (nameKey ? m[nameKey] : null) || 'Unnamed';
    if (!name || name === 'Unnamed') {
        const fk = keys.find(k => norm(k).includes('model') || norm(k).includes('name'));
        name = (fk ? m[fk] : null) || 'Unnamed';
    }
    if (String(name).toUpperCase().startsWith(vendor)) {
        name = String(name).substring(vendor.length).trim();
        if (name.startsWith('-')) name = name.substring(1).trim();
    }
    return `${vendor} - ${name}`;
}
function findMotor(motors: any[], rawName: any): any | null {
    const target = String(rawName || '').replace(/\s+/g, ' ').trim();
    if (!target || motors.length === 0) return null;
    const tl = target.toLowerCase();
    let found = motors.find(m => getMotorDisplayName(m).replace(/\s+/g, ' ').trim() === target);
    if (found) return found;
    found = motors.find(m => getMotorDisplayName(m).replace(/\s+/g, ' ').trim().toLowerCase() === tl);
    if (found) return found;
    const parts = target.split(' - ');
    const modelPart = (parts[parts.length - 1] || target).trim().toLowerCase();
    if (!modelPart) return null;
    return motors.find(m => getMotorDisplayName(m).toLowerCase().includes(modelPart)) || null;
}

/** Trailer effective sell (org over parent trailerOverrides). */
function trailerEffectiveSell(trailerId: string, doc: any): number {
    const sourceSell = doc?.sellPriceExclGst || 0;
    const own = FX.trailerOverrides?.[trailerId];
    const parent = FX.parentTrailerOverrides?.[trailerId];
    const sell = (typeof own?.sellPriceExclGst === 'number') ? own.sellPriceExclGst
        : (typeof parent?.sellPriceExclGst === 'number') ? parent.sellPriceExclGst : undefined;
    return sell ?? sourceSell;
}
function trailerStdOptionsSum(doc: any): number {
    return (doc?.optionalFeatures || []).filter((f: any) => f.isStandard)
        .reduce((s: number, f: any) => s + (f.sellExclGst || f.sellPriceExclGst || 0), 0);
}

/** FFR-18/19 dealer-fit section classifier replica. */
const RANGE_WORDS: Record<string, string> = { CL: 'CLASSIC', SP: 'SPORT', RU: 'ROLL', UL: 'ULTRAL', PA: 'PATROL', AL: 'ADVENTURE', AD: 'ADVENTURE', CO: 'COASTER' };
const RANGE_WORD_LIST = Array.from(new Set(Object.values(RANGE_WORDS)));
function classifySection(raw: string): 'hidden' | 'model' | 'general' {
    const c = raw.toUpperCase();
    if (c.startsWith('###') || c.includes('OBSELETE') || c.includes('OBSOLETE')) return 'hidden';
    if (c.includes('PRE DELIVERY') || c.includes('PRE-DELIVERY')) return 'hidden';
    if (c.includes('RIGGING KIT') || c.includes('HELM MASTER') || c.includes('ADD ON KITS')) return 'hidden';
    if (/(HIGHFIELD|STACER|STABICRAFT|SURTEES|JEANNEAU|FORMOSA|HAINES)/.test(c)
        && (/\d{3}/.test(c) || RANGE_WORD_LIST.some(w => c.includes(w)))) return 'model';
    if (c.includes('SPECIFIC OPTIONS')) return 'model';
    return 'general';
}
function modelSectionMatches(raw: string, modelName: string): boolean {
    const c = raw.toUpperCase();
    const modelDigits = (modelName.match(/(\d{3,4})/) || [])[1] || '';
    const modelRangeWord = RANGE_WORDS[modelName.slice(0, 2).toUpperCase()] || '';
    const vendorNameUpper = (FX.vendorName || 'Highfield').toUpperCase();
    const secDigits = (c.match(/(\d{3,4})/) || [])[1] || '';
    const secRange = RANGE_WORD_LIST.find(w => c.includes(w)) || '';
    if (secRange && secRange !== modelRangeWord) return false;
    if (secDigits && modelDigits && secDigits !== modelDigits) return false;
    if (secDigits && modelDigits && secDigits === modelDigits) return true;
    if (secRange && secRange === modelRangeWord) return true;
    if (!secDigits && !secRange && vendorNameUpper && c.includes(vendorNameUpper.split(' ')[0])) return true;
    return false;
}
function mergedCategories(key: string): string[] {
    const local: string[] = FX.module?.[key] || [];
    const seen = new Set(local.map((n: string) => n.toLowerCase()));
    const out = [...local];
    for (const lm of FX.linkedModules || []) {
        for (const n of (lm?.[key] || [])) {
            const k = String(n).toLowerCase();
            if (!seen.has(k)) { seen.add(k); out.push(n); }
        }
    }
    return out;
}
const MOTOR_CATS = new Set(mergedCategories('motorDealerFitCategories').map(c => c.toLowerCase()));
const TRAILER_CATS = new Set(mergedCategories('trailerDealerFitCategories').map(c => c.toLowerCase()));

/** groupedDealerFit replica → [category, sels[]] visible on Step 5. */
function expectedGroupedDealerFit(model: any): Array<[string, any[]]> {
    const allow: string[] = Array.isArray(model?.applicableDealerFitCategories)
        ? model.applicableDealerFitCategories.map((c: string) => c.toLowerCase()) : [];
    const groups: Record<string, any[]> = {};
    for (const sel of FX.dealerFitSelections || []) {
        const cat = sel.category || 'Gear';
        if (MOTOR_CATS.has(cat.toLowerCase())) continue;
        if (TRAILER_CATS.has(cat.toLowerCase())) continue;
        const klass = classifySection(cat);
        if (klass === 'hidden') continue;
        if (klass === 'model' && !modelSectionMatches(cat, model?.name || '')) continue;
        if (allow.length > 0 && !allow.includes(cat.toLowerCase())) continue;
        const restricted: string[] = Array.isArray(sel.applicableModelIds) ? sel.applicableModelIds : [];
        if (restricted.length > 0 && model?.id && !restricted.includes(model.id)) continue;
        (groups[cat] ||= []).push(sel);
    }
    return Object.entries(groups);
}
function dealerFitCardPrice(sel: any): number {
    return (sel.items || []).reduce((acc: number, i: any) =>
        acc + (i.data?.['Act Sell'] || i.data?.sellPriceExclGst || i.data?.['Store Price'] || i.data?.PARTS || i.data?.RRP || i.data?.Price || i.data?.Retail || i.data?.Trade || 0), 0);
}

/** fit-up selector replica: context filter + tier/name sort + sell resolve. */
function fitUpFirstN(model: any, variantId: string | undefined, n: number): any[] {
    const TIER_ORDER: Record<string, number> = { simple: 0, medium: 1, complex: 2 };
    const matches = (item: any) => {
        const checks: Array<[string[] | undefined, string | undefined]> = [
            [item.moduleIds, MODULE_ID], [item.brandIds, VENDOR_ID], [item.rangeIds, model.__rangeId],
            [item.modelIds, model.id], [item.variantIds, variantId],
        ];
        for (const [allowlist, value] of checks) {
            if (allowlist && allowlist.length > 0) { if (!value || !allowlist.includes(value)) return false; }
        }
        return true;
    };
    return (FX.fitUpItems || [])
        .filter(matches)
        .sort((a: any, b: any) => {
            const t = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
            return t !== 0 ? t : String(a.name ?? '').localeCompare(String(b.name ?? ''));
        })
        .slice(0, n);
}
const resolveFitUpSell = (item: any) => (item.sellPrice != null ? item.sellPrice : (item.cost ?? 0));

/** Rego bands (boat length / trailer ATM) for validating the auto-applied chip. */
function regoTypesFor(filter: 'boat' | 'trailer'): any[] {
    const out: any[] = [];
    for (const v of FX.regoVendors || []) {
        for (const t of v._regoTypes || []) {
            if (t.isActive === false) continue;
            const applies = t.appliesTo || 'both';
            if (filter === 'boat' && applies !== 'boat' && applies !== 'both') continue;
            if (filter === 'trailer' && applies !== 'trailer' && applies !== 'both') continue;
            out.push({ ...t, __vendorName: v.name });
        }
    }
    return out;
}
function boatLengthM(model: any): number | undefined {
    const code = String(model?.modelCode || model?.name || '');
    const m = code.match(/(\d{3})/);
    if (m) return parseInt(m[1], 10) / 100;
    return undefined;
}

/* ============================ results plumbing ============================ */

interface ModelResult {
    range: string; model: string; modelId: string;
    variants: { total: number; pricePass: number; priceFail: number };
    steps: Record<string, 'pass' | 'fail' | 'skip'>;
    priceAsserts: Record<string, { checked: number; failed: number }>;
    failures: string[];
    durationMs: number;
}
const RESULTS_PATH = path.join(OUT, 'results.json');
function loadResults(): Record<string, ModelResult> {
    try { return JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8')).models || {}; } catch { return {}; }
}
function flushResults(models: Record<string, ModelResult>) {
    fs.writeFileSync(RESULTS_PATH, JSON.stringify({ updatedUtc: new Date().toISOString(), models }, null, 1));
    const rows = Object.values(models);
    const md: string[] = [
        '# Highfield full-catalogue walkthrough — Steps 1→6 vs live MPF connections', '',
        `Updated: ${new Date().toISOString()} · ${rows.length} models walked`, '',
        '| Range | Model | Variants (price ✓/total) | S1 | S2 | S3 | S4 | S5 | S6 | Price asserts (fail/checked) | Failures |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
    ];
    const ic = (s?: string) => (s === 'pass' ? '✅' : s === 'fail' ? '❌' : '—');
    for (const r of rows) {
        const pa = Object.values(r.priceAsserts);
        const checked = pa.reduce((s, x) => s + x.checked, 0), failed = pa.reduce((s, x) => s + x.failed, 0);
        md.push(`| ${r.range} | ${r.model} | ${r.variants.pricePass}/${r.variants.total} | ${ic(r.steps.s1)} | ${ic(r.steps.s2)} | ${ic(r.steps.s3)} | ${ic(r.steps.s4)} | ${ic(r.steps.s5)} | ${ic(r.steps.s6)} | ${failed}/${checked} | ${r.failures.length ? r.failures.slice(0, 2).join('; ').replace(/\|/g, '/').slice(0, 160) : ''} |`);
    }
    fs.writeFileSync(path.join(OUT, 'WALKTHROUGH.md'), md.join('\n') + '\n');
}

/* ============================== page helpers ============================== */

async function readHeaderTotal(page: Page): Promise<number | null> {
    try {
        const txt = await page.locator('div.text-4xl').first().innerText({ timeout: 5000 });
        const m = txt.replace(/[\s,$]/g, '').match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    } catch { return null; }
}
async function waitTotalStable(page: Page, quietMs = 1200, timeoutMs = 9000): Promise<number | null> {
    let last: number | null = null; let lastChange = Date.now();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const v = await readHeaderTotal(page);
        if (v !== last) { last = v; lastChange = Date.now(); }
        else if (v !== null && Date.now() - lastChange >= quietMs) return v;
        await page.waitForTimeout(300);
    }
    return last;
}
async function waitTotalEquals(page: Page, expected: number, tol: number, timeoutMs = 6000): Promise<{ ok: boolean; actual: number | null }> {
    const start = Date.now();
    let actual: number | null = null;
    while (Date.now() - start < timeoutMs) {
        actual = await readHeaderTotal(page);
        if (actual !== null && Math.abs(actual - expected) <= tol) return { ok: true, actual };
        await page.waitForTimeout(300);
    }
    return { ok: false, actual };
}
async function nextStep(page: Page, settleMs: number) {
    await page.locator('button:has-text("Next Step"), button:has-text("Summary")').first().click({ force: true });
    await page.waitForTimeout(settleMs);
}
/** Read the auto-applied rego chip (name + $) if present in the given scope. */
async function readRegoChip(page: Page): Promise<{ name: string; amount: number } | null> {
    const badge = page.locator('text=/ex GST/').first();
    if (!(await badge.isVisible().catch(() => false))) return null;
    const badgeTxt = await badge.innerText().catch(() => '');
    const m = badgeTxt.replace(/,/g, '').match(/\$([\d.]+)/);
    if (!m) return null;
    const row = page.locator('div.bg-primary\\/5:has(:text("ex GST"))').first();
    const name = await row.innerText().catch(() => '');
    return { name: name.split('\n')[0] || '', amount: parseFloat(m[1]) };
}

const norm = (s: any) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/* ================================ the walk ================================ */

const ALL_MODELS: Array<{ range: any; model: any }> = [];
for (const rg of FX.ranges) {
    for (const m of rg._models) ALL_MODELS.push({ range: rg, model: m });
}

async function walkModel(page: Page, orgSlug: string, rg: any, master: any, res: ModelResult) {
    const t0 = Date.now();
    const override = FX.modelOverrides[master.id] || null;
    const model = getEffectiveModel(master, override);
    model.__rangeId = rg.id;
    const variants: any[] = master._variants; // useCollection order == REST __name__ order
    const pa = res.priceAsserts;
    const fail = (step: string, msg: string) => { res.failures.push(`[${step}] ${msg}`); };
    let shots = 0;
    const shot = async (tag: string) => {
        if (shots >= 4) return;
        shots++;
        await page.screenshot({ path: path.join(FAILS, `${model.name.replace(/[^\w-]/g, '_')}-${tag}.png`), fullPage: false }).catch(() => {});
    };

    await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}/quote/${master.id}?range=${rg.id}&vendor=${VENDOR_ID}&_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const onFlow = await page.locator('button:has-text("Next Step")').first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
    if (!onFlow) {
        for (const s of ['s1', 's2', 's3', 's4', 's5', 's6']) res.steps[s] = 'fail';
        fail('s1', 'quote flow did not mount (no Next Step button)');
        await shot('mount');
        return;
    }
    await page.waitForTimeout(1500);

    /* ---------------- Step 1 — variants + price + rego ---------------- */
    res.steps.s1 = 'pass';
    pa.s1_variants = { checked: 0, failed: 0 };
    const materials: string[] = Array.from(new Set(variants.map(v => v.material).filter(Boolean)));
    const hasMaterialAxis = materials.length > 0;
    const groupsInOrder: Array<{ material: string | null; vars: any[] }> = hasMaterialAxis
        ? materials.map(mat => ({ material: mat, vars: variants.filter(v => v.material === mat) }))
        : [{ material: null, vars: variants }];

    let offsetObs = 0;
    let firstPick = true;
    let activeVariant: any = null;
    let activeMaterial: string | null = null;
    let regoChip: { name: string; amount: number } | null = null;

    for (const group of groupsInOrder) {
        if (group.material) {
            const label = group.material === 'HYP' ? 'Hypalon' : group.material;
            const matBtn = page.locator('button.h-32').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first();
            if (!(await matBtn.isVisible().catch(() => false))) {
                fail('s1', `material button "${label}" not visible`); res.steps.s1 = 'fail'; await shot('s1-mat'); continue;
            }
            await matBtn.click({ force: true });
            await page.waitForTimeout(900);
        }
        const cards = page.locator('button.rounded-\\[1\\.5rem\\]');
        const cardCount = await cards.count();
        if (cardCount !== group.vars.length) {
            fail('s1', `colour cards for ${group.material ?? 'ALL'}: rendered ${cardCount} vs live ${group.vars.length}`);
            res.steps.s1 = 'fail'; await shot('s1-cards');
        }
        const n = Math.min(cardCount, group.vars.length);
        for (let i = 0; i < n; i++) {
            const v = group.vars[i];
            const cardTxt = await cards.nth(i).innerText().catch(() => '');
            if (!norm(cardTxt).includes(norm(v.name))) {
                fail('s1', `card[${i}] "${cardTxt.split('\n')[0]}" != live variant "${v.name}" (${group.material ?? 'no-mat'})`);
                res.steps.s1 = 'fail';
            }
            await cards.nth(i).click({ force: true });
            const vPrice = getPriceForLevel(v);
            pa.s1_variants.checked++;
            if (firstPick) {
                firstPick = false;
                // wait out auto-default trailer + auto-matched rego before anchoring the offset
                const expectRego = regoTypesFor('boat').some(t => {
                    const len = boatLengthM(model);
                    return len != null && t.minLengthM != null && t.maxLengthM != null && len >= t.minLengthM && len < t.maxLengthM;
                });
                if (expectRego) await page.locator('text=/ex GST/').first().waitFor({ timeout: 10000 }).catch(() => {});
                const total = await waitTotalStable(page);
                regoChip = await readRegoChip(page);
                if (total === null) {
                    fail('s1', 'header total unreadable'); res.steps.s1 = 'fail'; pa.s1_variants.failed++; await shot('s1-total');
                } else {
                    offsetObs = total - vPrice;
                    // validate the offset against the live default trailer + rego docs
                    const assignments: any[] = model.trailerAssignments || [];
                    const def = assignments.find((a: any) => a?.isDefault) || assignments[0];
                    let expTrailer = 0;
                    if (def) {
                        const tdoc = FX.trailers[`${def.brandVendorId}/${def.seriesId}/${def.trailerId}`];
                        if (tdoc) expTrailer = trailerEffectiveSell(def.trailerId, tdoc) + trailerStdOptionsSum(tdoc);
                    }
                    const expOffset = expTrailer + (regoChip?.amount ?? 0);
                    if (Math.abs(offsetObs - expOffset) > 2) {
                        fail('s1', `step-1 offset ${offsetObs} != expected ${Math.round(expOffset)} (default trailer ${Math.round(expTrailer)} + rego ${regoChip?.amount ?? 0}); variant ${v.name} $${vPrice}`);
                        res.steps.s1 = 'fail'; pa.s1_variants.failed++; await shot('s1-offset');
                    }
                    // rego chip must equal a live regoTypes doc for this hull length
                    if (regoChip) {
                        const hit = regoTypesFor('boat').find(t => norm(regoChip!.name).includes(norm(t.name)) || Math.abs((t.sellExclGst ?? -1) - regoChip!.amount) < 0.01);
                        pa.s1_rego = pa.s1_rego || { checked: 0, failed: 0 };
                        pa.s1_rego.checked++;
                        if (!hit || Math.abs((hit.sellExclGst ?? 0) - regoChip.amount) > 0.01) {
                            pa.s1_rego.failed++; fail('s1', `auto-rego chip $${regoChip.amount} "${regoChip.name}" has no matching live regoTypes doc`); res.steps.s1 = 'fail';
                        }
                    }
                }
            } else {
                const { ok, actual } = await waitTotalEquals(page, Math.round(vPrice + offsetObs), 1);
                if (!ok) {
                    pa.s1_variants.failed++; res.steps.s1 = 'fail';
                    fail('s1', `variant ${v.name}: total ${actual} != ${Math.round(vPrice + offsetObs)} (live $${vPrice} + offset ${Math.round(offsetObs)})`);
                    await shot('s1-price');
                }
            }
            activeVariant = v;
            activeMaterial = group.material;
        }
    }
    res.variants.total = pa.s1_variants.checked;
    res.variants.pricePass = pa.s1_variants.checked - pa.s1_variants.failed;
    res.variants.priceFail = pa.s1_variants.failed;
    // Registration section renders once a colour is picked
    if (activeVariant && (await page.locator('text=/Registration/i').count()) === 0) {
        fail('s1', 'Registration section absent after colour pick'); res.steps.s1 = 'fail'; await shot('s1-rego');
    }
    if (!activeVariant) { for (const s of ['s2', 's3', 's4', 's5', 's6']) res.steps[s] = 'skip'; return; }

    /* --------------- Step 2 — factory option card prices --------------- */
    await nextStep(page, 2800);
    res.steps.s2 = 'pass';
    pa.s2_options = { checked: 0, failed: 0 };
    const expOpts = expectedStep2Options(model, activeVariant, activeMaterial);
    const renderedCards: string[] = await page.$$eval('button.rounded-\\[1\\.5rem\\]', els => els.map(e => (e as HTMLElement).innerText));
    for (const opt of expOpts) {
        const { base } = formatOptionDisplayLabel(opt.name);
        const priceStr = `$${(opt.sellPriceExclGst || 0).toLocaleString('en-US')}`;
        pa.s2_options.checked++;
        const hit = renderedCards.find(t => norm(t).includes(norm(base)));
        if (!hit) {
            pa.s2_options.failed++; res.steps.s2 = 'fail';
            fail('s2', `option "${base}" not rendered`); await shot('s2-miss');
        } else {
            // price must appear in one card that carries this base name
            const priced = renderedCards.some(t => norm(t).includes(norm(base)) && t.includes(priceStr));
            if (!priced) {
                pa.s2_options.failed++; res.steps.s2 = 'fail';
                fail('s2', `option "${base}": price ${priceStr} (live sellPriceExclGst) not shown — card text "${(hit || '').replace(/\n/g, ' | ').slice(0, 120)}"`);
                await shot('s2-price');
            }
        }
    }

    /* -------- Step 3 — NSM Recommended cards == motorMenu exactly -------- */
    await nextStep(page, 4200);
    res.steps.s3 = 'pass';
    pa.s3_motorCards = { checked: 0, failed: 0 };
    const menu: any[] = Array.isArray(activeVariant.motorMenu) ? [...activeVariant.motorMenu].sort((a, b) => (a?.slot ?? 0) - (b?.slot ?? 0)) : [];
    const motors = buildMotorsForModel(model);
    const nsmHeader = page.locator('h3:has-text("NSM Recommended for this hull")');
    const headerVisible = await nsmHeader.isVisible().catch(() => false);
    if (menu.length > 0 && !headerVisible) {
        // motors may still be loading — give it one more beat
        await page.waitForTimeout(4000);
    }
    const headerVisible2 = headerVisible || (await nsmHeader.isVisible().catch(() => false));
    if (menu.length > 0 !== headerVisible2) {
        res.steps.s3 = 'fail';
        fail('s3', `NSM section visible=${headerVisible2} but variant.motorMenu has ${menu.length} slots`);
        await shot('s3-section');
    }
    let slot1Resolved: any = null;
    if (menu.length > 0 && headerVisible2) {
        const nsmCardTexts: string[] = (await page.$$eval('button.rounded-\\[1\\.5rem\\]', els => els.map(e => (e as HTMLElement).innerText)))
            .filter(t => /^\s*SLOT\s+\d+/im.test(t));
        if (nsmCardTexts.length !== menu.length) {
            res.steps.s3 = 'fail';
            fail('s3', `NSM cards rendered ${nsmCardTexts.length} != motorMenu slots ${menu.length}`);
            await shot('s3-count');
        }
        for (let i = 0; i < menu.length; i++) {
            const entry = menu[i];
            const card = nsmCardTexts[i];
            pa.s3_motorCards.checked++;
            if (!card) { pa.s3_motorCards.failed++; continue; }
            let bad = '';
            if (entry.motorName && !norm(card).includes(norm(entry.motorName))) bad += `name "${entry.motorName}" missing; `;
            if (entry.riggingKit && !norm(card).includes(norm(entry.riggingKit))) bad += `rigging kit "${entry.riggingKit}" missing; `;
            if (entry.propDesc && !norm(card).includes(norm(entry.propDesc))) bad += `prop "${entry.propDesc}" missing; `;
            const motor = findMotor(motors, entry.motorName);
            if (motor) {
                const exp = formatCurrency(getPriceForLevel(motor, 'hull_cash'));
                if (!card.includes(exp)) bad += `price ${exp} (Yamaha hull_cash/NSM Retail) missing — card shows "${(card.match(/\$[\d,.]+/) || ['none'])[0]}"; `;
                if ((entry.slot ?? i + 1) === (menu[0].slot ?? 1) && i === 0) slot1Resolved = { entry, motor };
            } else if (!/Not in this module/i.test(card)) {
                bad += 'unresolved slot should say "Not in this module\'s motor list"; ';
            }
            if (bad) {
                pa.s3_motorCards.failed++; res.steps.s3 = 'fail';
                fail('s3', `slot ${entry.slot ?? i + 1} (${entry.motorName}): ${bad}`);
                await shot('s3-card');
            }
        }
    }
    // Deterministic end-state for the Step-6 sum: slot-1 motor, or no motor.
    let expMotorContrib = 0;
    if (slot1Resolved) {
        const firstNsmCard = page.locator('button.rounded-\\[1\\.5rem\\]').filter({ hasText: /SLOT\s+1/i }).first();
        await firstNsmCard.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1200);
        const std = (slot1Resolved.motor.masterAccessories || []).filter((a: any) => a.isStandard);
        expMotorContrib = getPriceForLevel(slot1Resolved.motor, 'hull_cash') + std.reduce((s: number, a: any) => s + getPriceForLevel(a, 'hull_cash'), 0);
    } else {
        const hero = page.locator('button[aria-label*="remove motor" i]').first();
        if (await hero.isVisible().catch(() => false)) { await hero.click({ force: true }); await page.waitForTimeout(800); }
    }
    if (await page.locator('text=/Total Savings/i').isVisible().catch(() => false)) {
        fail('s3', 'unexpected active promotion discount visible (fixture says no active promos)');
        res.steps.s3 = 'fail';
    }

    /* ----------- Step 4 — trailer menu + per-card price checks ----------- */
    await nextStep(page, 3200);
    res.steps.s4 = 'pass';
    pa.s4_trailers = { checked: 0, failed: 0 };
    const tMenu: any[] = Array.isArray(activeVariant.trailerMenu) ? [...activeVariant.trailerMenu].sort((a, b) => (a?.slot ?? 0) - (b?.slot ?? 0)) : [];
    const tHeader = page.locator('h3:has-text("NSM Recommended trailers")');
    const tHeaderVis = await tHeader.isVisible().catch(() => false);
    if ((tMenu.length > 0) !== tHeaderVis) {
        res.steps.s4 = 'fail';
        fail('s4', `NSM trailer section visible=${tHeaderVis} but variant.trailerMenu has ${tMenu.length} entries`);
        await shot('s4-section');
    }
    if (tMenu.length > 0 && tHeaderVis) {
        const pageText = await page.locator('body').innerText().catch(() => '');
        for (const entry of tMenu) {
            const label = entry.name || entry.display || 'Trailer';
            if (!norm(pageText).includes(norm(label))) {
                res.steps.s4 = 'fail';
                fail('s4', `trailer menu entry "${label}" not rendered`);
                await shot('s4-menu');
            }
        }
    }
    // Every assignment card: select → price shown == live trailer doc effective sell
    const assignments: any[] = model.trailerAssignments || [];
    const assignmentByKey: Record<string, any> = {};
    for (const a of assignments) {
        if (!a?.trailerId) continue;
        assignmentByKey[`${a.brandVendorId}/${a.seriesId}/${a.trailerId}`] = a;
        const tdoc = FX.trailers[`${a.brandVendorId}/${a.seriesId}/${a.trailerId}`];
        pa.s4_trailers.checked++;
        const cardSel = page.locator('button.rounded-\\[1\\.5rem\\]').filter({ hasText: a.code || a.name || a.trailerId }).first();
        if (!(await cardSel.isVisible().catch(() => false))) {
            pa.s4_trailers.failed++; res.steps.s4 = 'fail';
            fail('s4', `assignment card "${a.code || a.name}" not visible`); await shot('s4-card');
            continue;
        }
        if (!tdoc) {
            pa.s4_trailers.failed++; res.steps.s4 = 'fail';
            fail('s4', `assignment "${a.code || a.name}" has no live trailer doc at data-warehouse/${a.brandVendorId}/series/${a.seriesId}/trailers/${a.trailerId}`);
            continue;
        }
        await cardSel.click({ force: true });
        const expSell = trailerEffectiveSell(a.trailerId, tdoc);
        const expStr = `$${(expSell || 0).toLocaleString('en-US')}`;
        const shown = await cardSel.locator(`text=${expStr}`).first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
        if (!shown) {
            const cardTxt = await cardSel.innerText().catch(() => '');
            pa.s4_trailers.failed++; res.steps.s4 = 'fail';
            fail('s4', `trailer ${a.code || a.name}: expected ${expStr} (live doc sell + overrides) — card "${cardTxt.replace(/\n/g, ' | ').slice(0, 120)}"`);
            await shot('s4-price');
        }
        await page.waitForTimeout(400);
    }
    // Deterministic end-state: trailerMenu slot-1's assignment, else no trailer.
    let expTrailerContrib = 0;
    let finalTrailerDoc: any = null; let finalTrailerAssignment: any = null;
    const slot1T = tMenu[0];
    if (slot1T) {
        const findAssignment = (label: any): any | null => {
            const nrm = norm(label);
            if (!nrm || assignments.length === 0) return null;
            return assignments.find(a => norm(a?.name) === nrm || norm(a?.code) === nrm)
                || assignments.find(a => norm(a?.code) && nrm.includes(norm(a?.code)))
                || assignments.find(a => { const an = norm(a?.name); return !!an && (nrm.includes(an) || an.includes(nrm)); })
                || null;
        };
        finalTrailerAssignment = findAssignment(slot1T.name ?? slot1T.display);
    }
    if (!finalTrailerAssignment && assignments.length > 0) {
        finalTrailerAssignment = assignments.find((a: any) => a?.isDefault) || assignments[0];
    }
    if (finalTrailerAssignment) {
        finalTrailerDoc = FX.trailers[`${finalTrailerAssignment.brandVendorId}/${finalTrailerAssignment.seriesId}/${finalTrailerAssignment.trailerId}`];
        const cardSel = page.locator('button.rounded-\\[1\\.5rem\\]').filter({ hasText: finalTrailerAssignment.code || finalTrailerAssignment.name || '' }).first();
        // ensure it's the active one (it may already be from the loop's last click)
        await cardSel.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1500);
        // clicking an active card unticks — re-check and re-click if the price vanished
        if (finalTrailerDoc) {
            const expStr = `$${(trailerEffectiveSell(finalTrailerAssignment.trailerId, finalTrailerDoc) || 0).toLocaleString('en-US')}`;
            const active = await cardSel.locator(`text=${expStr}`).isVisible().catch(() => false);
            if (!active) { await cardSel.click({ force: true }).catch(() => {}); await page.waitForTimeout(1500); }
            expTrailerContrib = trailerEffectiveSell(finalTrailerAssignment.trailerId, finalTrailerDoc) + trailerStdOptionsSum(finalTrailerDoc);
        }
    } else {
        const noTrailer = page.locator('button:has-text("No trailer")').first();
        if (await noTrailer.isVisible().catch(() => false)) { await noTrailer.click({ force: true }); await page.waitForTimeout(800); }
    }
    // Trailer rego chip (auto-matched from ATM) — validate against live regoTypes
    let trailerRegoAmount = 0;
    if (finalTrailerAssignment) {
        await page.waitForTimeout(1500);
        const chips = page.locator('div.bg-primary\\/5:has(:text("ex GST"))');
        const chipCount = await chips.count();
        if (chipCount > 0) {
            const txt = await chips.last().innerText().catch(() => '');
            const m = txt.replace(/,/g, '').match(/\$([\d.]+)\s*ex GST/i);
            if (m) {
                trailerRegoAmount = parseFloat(m[1]);
                pa.s4_rego = pa.s4_rego || { checked: 0, failed: 0 };
                pa.s4_rego.checked++;
                const hit = regoTypesFor('trailer').find(t => Math.abs((t.sellExclGst ?? -1) - trailerRegoAmount) < 0.01);
                if (!hit) {
                    pa.s4_rego.failed++; res.steps.s4 = 'fail';
                    fail('s4', `trailer rego chip $${trailerRegoAmount} matches no live trailer regoTypes doc`);
                }
            }
        }
    }

    /* --- Step 5 — dealer-fit strip + classifier + card prices + fit-up --- */
    await nextStep(page, 5000);
    res.steps.s5 = 'pass';
    pa.s5_dealerFit = { checked: 0, failed: 0 };
    pa.s5_fitUp = { checked: 0, failed: 0 };
    const dfLines: string[] = Array.isArray(activeVariant.dealerFitLines)
        ? activeVariant.dealerFitLines.map((l: any) => String(l || '').trim()).filter(Boolean) : [];
    const stripHeader = page.locator('h3:has-text("Recommended for this boat")');
    const stripVis = await stripHeader.isVisible().catch(() => false);
    if ((dfLines.length > 0) !== stripVis) {
        res.steps.s5 = 'fail';
        fail('s5', `recommended strip visible=${stripVis} but variant.dealerFitLines has ${dfLines.length} lines`);
        await shot('s5-strip');
    }
    if (dfLines.length > 0 && stripVis) {
        const stripBox = page.locator('div.rounded-\\[1\\.5rem\\].border-primary\\/15').first();
        const stripTxt = await stripBox.innerText().catch(() => '');
        const chipCount = await stripBox.locator('button, span.rounded-full').count();
        if (chipCount !== dfLines.length) {
            res.steps.s5 = 'fail';
            fail('s5', `strip chips ${chipCount} != dealerFitLines ${dfLines.length}`);
        }
        // rendered chip = matched dealerFitSelections name OR the raw line
        const sels = FX.dealerFitSelections || [];
        for (const line of dfLines) {
            const n = norm(line);
            const hit = sels.find((s: any) => norm(s?.name) === n)
                || sels.find((s: any) => { const sn = norm(s?.name); return !!sn && (n.includes(sn) || sn.includes(n)); }) || null;
            const shownName = hit ? (hit.name || line) : line;
            if (!norm(stripTxt).includes(norm(shownName))) {
                res.steps.s5 = 'fail';
                fail('s5', `dealer-fit line "${line}" (renders as "${shownName}") missing from strip`);
                await shot('s5-line');
            }
        }
    }
    // FFR-18/19 — no junk / foreign-pack categories; expected ones visible.
    const h3s: string[] = await page.$$eval('h3', els => els.map(e => (e as HTMLElement).innerText.trim()));
    const junk = h3s.filter(t => /###|OBSELETE|OBSOLETE|PRE.?DELIVERY|RIGGING KIT|HELM MASTER|ADD ON KITS/i.test(t));
    if (junk.length) {
        res.steps.s5 = 'fail';
        fail('s5', `hidden-class categories visible on Step 5: ${junk.slice(0, 3).join(' · ')}`);
        await shot('s5-junk');
    }
    const expGroups = expectedGroupedDealerFit(model);
    const expCatSet = new Set(expGroups.map(([c]) => norm(c)));
    for (const [cat] of expGroups) {
        if (!h3s.some(t => norm(t) === norm(cat))) {
            res.steps.s5 = 'fail';
            fail('s5', `expected dealer-fit category "${cat}" not rendered`);
            await shot('s5-cat');
        }
    }
    // foreign model packs: any h3 that classifies as model-scoped but doesn't match this boat
    for (const t of h3s) {
        if (classifySection(t) === 'model' && !modelSectionMatches(t, model.name || '') && !expCatSet.has(norm(t))) {
            res.steps.s5 = 'fail';
            fail('s5', `foreign model pack visible: "${t}" (FFR-19 range/digit scope violation)`);
            await shot('s5-foreign');
        }
    }
    // every rendered dealer-fit card price == Act Sell chain sum
    const dfCardTexts: string[] = await page.$$eval('div.rounded-\\[1\\.5rem\\] > button.flex.flex-col.p-1, div.rounded-\\[1\\.5rem\\] button.w-full', els => els.map(e => (e as HTMLElement).innerText));
    for (const [cat, sels] of expGroups) {
        for (const sel of sels) {
            pa.s5_dealerFit.checked++;
            const expStr = `$${dealerFitCardPrice(sel).toLocaleString('en-US')}`;
            const hit = dfCardTexts.find(t => norm(t).includes(norm(sel.name)));
            if (!hit) {
                pa.s5_dealerFit.failed++; res.steps.s5 = 'fail';
                fail('s5', `dealer-fit card "${sel.name}" (${cat}) not rendered`);
            } else if (!hit.includes(expStr)) {
                pa.s5_dealerFit.failed++; res.steps.s5 = 'fail';
                fail('s5', `dealer-fit "${sel.name}": expected ${expStr} (Act Sell chain) — card "${(hit.match(/\$[\d,.]+/) || ['no $'])[0]}"`);
            }
        }
    }
    // fit-up selector mounts + first-10 item prices == org fitUpItems sellPrice
    const fitUpMounted = (await page.locator('text=/Fit-?up/i').count()) > 0;
    if (!fitUpMounted) {
        res.steps.s5 = 'fail'; fail('s5', 'Fit-Up selector did not mount'); await shot('s5-fitup');
    } else {
        for (const item of fitUpFirstN(model, activeVariant.id, 10)) {
            pa.s5_fitUp.checked++;
            const expStr = `$${resolveFitUpSell(item).toLocaleString('en-US')}`;
            const btn = page.locator('button').filter({ hasText: item.name }).first();
            const vis = await btn.isVisible().catch(() => false);
            const txt = vis ? await btn.innerText().catch(() => '') : '';
            if (!vis || !txt.includes(expStr)) {
                pa.s5_fitUp.failed++; res.steps.s5 = 'fail';
                fail('s5', `fit-up item "${item.name}": expected ${expStr} — ${vis ? `card "${(txt.match(/\$[\d,.]+/) || ['no $'])[0]}"` : 'not rendered'}`);
            }
        }
    }
    // rigging line for the picked slot-1 motor
    if (slot1Resolved?.entry?.riggingKit) {
        const rigLine = page.locator('text=/Rigging:/i').first();
        if (!(await rigLine.isVisible().catch(() => false))) {
            res.steps.s5 = 'fail';
            fail('s5', `rigging line for slot-1 kit "${slot1Resolved.entry.riggingKit}" not rendered on Step 5`);
            await shot('s5-rig');
        }
    }

    /* -------------- Step 6 — summary lines + sum of picks -------------- */
    await nextStep(page, 3500);
    res.steps.s6 = 'pass';
    pa.s6_summary = { checked: 0, failed: 0 };
    const vPrice = getPriceForLevel(activeVariant);
    pa.s6_summary.checked++;
    const baseLine = `$${vPrice.toLocaleString('en-US')}`;
    const baseCard = page.locator('div:has(> div > div > p:text-is("Base Vessel")), div.rounded-\\[1\\.5rem\\]').filter({ hasText: 'Base Vessel' }).first();
    const baseTxt = await baseCard.innerText().catch(() => '');
    if (!baseTxt.includes(baseLine)) {
        pa.s6_summary.failed++; res.steps.s6 = 'fail';
        fail('s6', `Base Vessel line: expected ${baseLine} (live hull_cash) — card "${(baseTxt.match(/\$[\d,.]+/) || ['no $'])[0]}"`);
        await shot('s6-base');
    }
    if (slot1Resolved) {
        pa.s6_summary.checked++;
        const mLine = `$${(slot1Resolved.motor.sellPriceExclGst || 0).toLocaleString('en-US')}`;
        const mCard = page.locator('div.rounded-\\[1\\.5rem\\]').filter({ hasText: 'Powertrain' }).first();
        const mTxt = await mCard.innerText().catch(() => '');
        if (!mTxt.includes(mLine)) {
            pa.s6_summary.failed++; res.steps.s6 = 'fail';
            fail('s6', `Powertrain line: expected ${mLine} — card "${(mTxt.match(/\$[\d,.]+/) || ['no $'])[0]}"`);
            await shot('s6-motor');
        }
    }
    if (finalTrailerDoc && finalTrailerAssignment) {
        pa.s6_summary.checked++;
        const tLine = `$${(trailerEffectiveSell(finalTrailerAssignment.trailerId, finalTrailerDoc) || 0).toLocaleString('en-US')}`;
        const tCard = page.locator('div.rounded-\\[1\\.5rem\\]').filter({ hasText: 'Towing Solution' }).first();
        const tTxt = await tCard.innerText().catch(() => '');
        if (!tTxt.includes(tLine)) {
            pa.s6_summary.failed++; res.steps.s6 = 'fail';
            fail('s6', `Towing Solution line: expected ${tLine} — card "${(tTxt.match(/\$[\d,.]+/) || ['no $'])[0]}"`);
            await shot('s6-trailer');
        }
    }
    // header total == sum of every pick (variant + rego + motor+std acc + trailer+std opts + trailer rego)
    pa.s6_summary.checked++;
    const expTotal = vPrice + (regoChip?.amount ?? 0) + expMotorContrib + expTrailerContrib + trailerRegoAmount;
    const { ok: totOk, actual: totActual } = await waitTotalEquals(page, Math.round(expTotal), 2, 8000);
    if (!totOk) {
        pa.s6_summary.failed++; res.steps.s6 = 'fail';
        fail('s6', `total ${totActual} != sum of picks ${Math.round(expTotal)} (boat ${Math.round(vPrice)} + rego ${regoChip?.amount ?? 0} + motor ${Math.round(expMotorContrib)} + trailer ${Math.round(expTrailerContrib)} + trailer rego ${trailerRegoAmount})`);
        await shot('s6-total');
    }
    res.durationMs = Date.now() - t0;
}

/* ============================ Part 1 test suite =========================== */

test.describe('Part 1 — full Highfield catalogue walk', () => {
    for (const rg of FX.ranges) {
        test(`Part 1 — walk ${rg.name} (${rg._models.length} models)`, async ({ page }) => {
            test.setTimeout(Math.max(20, rg._models.length * 4) * 60_000);
            page.on('dialog', d => d.dismiss().catch(() => {}));
            await login(page);
            const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
            const orgSlug = m ? m[1] : 'northside-marine';

            const results = loadResults();
            for (const model of rg._models) {
                const key = `${rg.name}/${model.name}`;
                const res: ModelResult = {
                    range: rg.name, model: model.name, modelId: model.id,
                    variants: { total: 0, pricePass: 0, priceFail: 0 },
                    steps: {}, priceAsserts: {}, failures: [], durationMs: 0,
                };
                try {
                    await walkModel(page, orgSlug, rg, model, res);
                } catch (e: any) {
                    res.failures.push(`[crash] ${String(e?.message || e).slice(0, 300)}`);
                    for (const s of ['s1', 's2', 's3', 's4', 's5', 's6']) res.steps[s] = res.steps[s] || 'fail';
                    await page.screenshot({ path: path.join(FAILS, `${model.name.replace(/[^\w-]/g, '_')}-crash.png`) }).catch(() => {});
                }
                results[key] = res;
                flushResults(results);
                const bad = res.failures.length;
                console.log(`${bad ? '❌' : '✅'} ${key} — ${res.variants.pricePass}/${res.variants.total} variant prices, ${bad} failure(s), ${(res.durationMs / 1000).toFixed(0)}s`);
            }
            // The walk itself never throws — surface range health as the assertion.
            const rangeRows = Object.values(results).filter(r => r.range === rg.name);
            const failures = rangeRows.reduce((s, r) => s + r.failures.length, 0);
            console.log(`RANGE ${rg.name}: ${rangeRows.length} models, ${failures} failure entries`);
            expect(failures, `${failures} assertion failures across ${rg.name} — see ${RESULTS_PATH}`).toBe(0);
        });
    }
});

/* ==================== Part 2 — SP560 walkthrough VIDEO ==================== */

test.describe('Part 2 — SP560 video', () => {
    test('SP560 polished walkthrough (recorded)', async ({ browser }) => {
        test.setTimeout(600_000);
        const BRIDGE_PORT = Number(process.env.VISUAL_TLS_BRIDGE_PORT || 39555);
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            recordVideo: { dir: path.join(OUT, 'video-raw'), size: { width: 1440, height: 900 } },
            ignoreHTTPSErrors: true,
            serviceWorkers: 'block',
            // mirror the evidence-config sandbox TLS bridge for Firebase traffic
            proxy: process.env.HTTPS_PROXY
                ? { server: `http://127.0.0.1:${BRIDGE_PORT}`, bypass: 'localhost,127.0.0.1' }
                : undefined,
        });
        const page = await context.newPage();
        const pace = async (ms = 500) => page.waitForTimeout(ms);
        let sp560: { rg: any; model: any } | null = null;
        for (const rg of FX.ranges) for (const mm of rg._models) if (mm.name === 'SP560') sp560 = { rg, model: mm };
        expect(sp560, 'SP560 must exist in the live catalogue').not.toBeNull();

        await login(page);
        const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
        const orgSlug = m ? m[1] : 'northside-marine';
        await pace(800);

        await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}/quote/${sp560!.model.id}?range=${sp560!.rg.id}&vendor=${VENDOR_ID}`);
        await page.waitForLoadState('domcontentloaded');
        await page.locator('button:has-text("Next Step")').first().waitFor({ timeout: 30000 });
        await pace(1500);

        // Step 1 — PVC + first colour; rego auto-matches from hull length.
        const mat = page.locator('button.h-32').filter({ hasText: /^\s*PVC\s*$/i }).first();
        if (await mat.isVisible().catch(() => false)) { await mat.click(); await pace(900); }
        await page.locator('button.rounded-\\[1\\.5rem\\]').first().click();
        await pace(1200);
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.locator('text=/ex GST/').first().waitFor({ timeout: 10000 }).catch(() => {});
        await pace(1400);

        // Step 2 — pick 1 factory option.
        await nextStep(page, 2500);
        const fo = page.locator('button.rounded-\\[1\\.5rem\\]').first();
        await fo.scrollIntoViewIfNeeded().catch(() => {});
        await pace(500);
        await fo.click({ force: true });
        await pace(1200);

        // Step 3 — pick NSM Recommended Slot 1 (F90XB).
        await nextStep(page, 4500);
        const slot1 = page.locator('button.rounded-\\[1\\.5rem\\]').filter({ hasText: /SLOT\s+1/i }).first();
        await slot1.waitFor({ timeout: 15000 });
        const slot1Txt = await slot1.innerText();
        console.log('▶ SP560 Slot 1 card:', slot1Txt.replace(/\n/g, ' | '));
        expect(slot1Txt).toMatch(/F90/i); // F90XB per the MPF motor menu
        await slot1.click();
        await pace(1500);

        // Step 4 — recommended trailer (slot 1 / default assignment already active).
        await nextStep(page, 3500);
        const trailerCard = page.locator('button.rounded-\\[1\\.5rem\\]').filter({ hasText: /Matches assigned trailer/i }).first();
        if (await trailerCard.isVisible().catch(() => false)) { await trailerCard.click(); }
        await pace(2000);

        // Step 5 — two DFOs from the recommended strip: tube covers + GME VHF.
        await nextStep(page, 5000);
        const strip = page.locator('div.rounded-\\[1\\.5rem\\].border-primary\\/15').first();
        await strip.waitFor({ timeout: 15000 }).catch(() => {});
        for (const pat of [/tube cover/i, /GME/i]) {
            const chip = strip.locator('button').filter({ hasText: pat }).first();
            if (await chip.isVisible().catch(() => false)) {
                await chip.scrollIntoViewIfNeeded().catch(() => {});
                await pace(600);
                await chip.click();
                await pace(1000);
            } else {
                console.log(`▶ strip chip ${pat} not found — falling back to card grid`);
                const card = page.locator('button').filter({ hasText: pat }).first();
                if (await card.isVisible().catch(() => false)) { await card.click(); await pace(1000); }
            }
        }
        await pace(1000);

        // Step 6 — summary; end on the totals.
        await nextStep(page, 4000);
        await page.locator('text=/Project Build Summary/i').first().waitFor({ timeout: 15000 }).catch(() => {});
        const total = await waitTotalStable(page);
        console.log(`▶ SP560 final total on screen: $${total?.toLocaleString('en-US')}`);
        const incGst = await page.locator('text=/inc GST/i').first().innerText().catch(() => '');
        console.log(`▶ inc GST line: ${incGst}`);
        fs.writeFileSync(path.join(OUT, 'sp560-video-meta.json'), JSON.stringify({
            recordedUtc: new Date().toISOString(), finalTotalExGst: total, incGstLine: incGst,
        }, null, 2));
        // linger on the totals so the video ends on the money shot
        await pace(4000);
        const video = page.video();
        await context.close(); // flushes the webm
        if (video) {
            const raw = await video.path();
            const dest = path.join(OUT, 'SP560_walkthrough.webm');
            fs.copyFileSync(raw, dest);
            console.log(`▶ video saved: ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
        }
        expect(total, 'SP560 must end on a rendered non-zero total').toBeGreaterThan(10000);
    });
});
