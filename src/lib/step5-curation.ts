/**
 * Step-5 dealer-fit curation engine (v1.31 addendum — Story 12.4.2).
 *
 * Asaf's 2026-07-04 field audit of Step 5 found a CLASS of problem:
 * data-consistent but product-senseless presentation. The MPF Dealer Fit
 * sheet imports verbatim as 93 sections × 1,791 rows; without curation a
 * CL380 tender sees eight identical $813 per-SKU pre-delivery packs, F300
 * cowl covers, 7-metre tube covers, workshop job-card sub-items and
 * "Engine Removal" lines on a NEW-boat quote.
 *
 * This module is the single home for every Step-5 relevance decision:
 *
 *   1. classifySection / modelSectionMatches — section-level visibility
 *      (moved verbatim from highfield-quote-flow.tsx groupedDealerFit;
 *      covered by the 33-case FFR-24 harness, now in
 *      tests/unit/step5-curation.test.ts).
 *   2. routeSection — keyword routing of outboard/tiller/prop sections to
 *      the MOTOR dealer-fit group and trailer-accessory sections to the
 *      TRAILER group (they render on those steps, not the boat step).
 *   3. itemRelevance — NAMED item-level rules (R-*) that hide rows which
 *      cannot fit the boat being quoted. Every rule is listed in
 *      RELEVANCE_RULES with a rationale, fails OPEN when context is
 *      missing, and is bypassed by the operator "Show all" escape hatch —
 *      narrowing must never hard-block a legitimate sale.
 *   4. selectVariantRows — per-SKU model-pack dedupe: of the N
 *      material×colour pack rows, show only the one matching the ACTIVE
 *      hull variant (primary: the MPF part code embeds the variant SKU,
 *      e.g. 9HI_HBC 065_PD ↔ HBC065; fallback: model-token + material +
 *      colour-code parse of the row name).
 *   5. prettifySectionName — operator/customer-facing display names for
 *      the raw MPF supplier headings ("MAJESTIC TV OPTIONS" → "TV &
 *      Entertainment"); the original stays in a title attr for
 *      traceability.
 *
 * Pure TypeScript — no React, no Firestore. Unit-tested in
 * tests/unit/step5-curation.test.ts (legacy 33 classifier cases + one
 * suite per named rule).
 */

// ---------------------------------------------------------------- context

export interface CurationContext {
    /** Model code / name, e.g. 'CL380', 'RU230KAM', 'Surtees - 540 Gamefisher'. */
    modelName: string;
    /** Vendor (brand) name, e.g. 'Highfield Boats', 'Surtees'. */
    vendorName: string;
    /** Hull length in metres (Highfield codes encode length×100). */
    hullLengthM?: number;
    /** Motor envelope — model.motorEnvelope (MPF) or
     *  specifications.motorConfigurations[0].engines[0]. */
    minHp?: number;
    maxHp?: number;
    /** 'Remote' | 'Tiller' (model.motorEnvelope.engConfiguration). */
    engConfiguration?: string;
    /** Active hull variant (Step-1 selection). */
    variantSku?: string;
    /** e.g. 'CL380 — White / White / Wood Dark'. */
    variantName?: string;
    /** 'PVC' | 'HYP' | 'Hypalon'. */
    variantMaterial?: string;
}

// ------------------------------------------- section classifier (FFR-24)
// Moved VERBATIM from highfield-quote-flow.tsx groupedDealerFit. Behaviour
// changes here MUST extend tests/unit/step5-curation.test.ts (the FFR-24
// 33-case harness lives there now).

export type SectionClass = 'hidden' | 'workshop' | 'model' | 'general';

/** R-BOATPACK (Asaf field ruling): items that ARE the model's own
 *  variant rows ('CLASSIC - CL380 PVC - W-W') duplicate the Step-1
 *  variant choice — never browsable on Step 5. Matches
 *  RANGE - MODEL MATERIAL - COLOURCODES shape with no other words. */
export function isVariantRowItem(name: string): boolean {
    return /^[A-Z ]{3,15}-\s*[A-Z]{2,3}\d{3}[A-Z]{0,3}\s+(PVC|HYP|ALU)\s*-\s*[A-Z]{1,3}(-[A-Z]{1,3}){0,3}$/i
        .test((name || '').trim());
}


const RANGE_WORDS: Record<string, string> = {
    CL: 'CLASSIC', SP: 'SPORT', RU: 'ROLL', UL: 'ULTRAL',
    PA: 'PATROL', AL: 'ADVENTURE', AD: 'ADVENTURE', CO: 'COASTER',
};
const RANGE_WORD_LIST = Array.from(new Set([...Object.values(RANGE_WORDS), 'ZEROJET']));
const BRAND_WORD_RE = /(HIGHFIELD|STACER|STABICRAFT|SURTEES|JEANNEAU|FORMOSA|HAINES)/;

/**
 * Section-level classification:
 *   hidden   — never a customer-facing boat DFO category (rigging kits,
 *              pre-delivery ops, obsolete lists) — NOT revealable.
 *   workshop — workshop/service operations that make no sense on a
 *              NEW-boat quote (engine removals, surveying sublets); they
 *              stay available in counter/service quotes and behind the
 *              Step-5 "Show all" escape hatch (R-NEWBOAT / R-WORKSHOP).
 *   model    — model-scoped pack: show ONLY on the matching boat.
 *   general  — genuine accessory category: always show.
 */
export function classifySection(raw: string): SectionClass {
    const c = raw.toUpperCase();
    if (c.startsWith('###') || c.includes('OBSELETE') || c.includes('OBSOLETE')) return 'hidden';
    if (c.includes('PRE DELIVERY') || c.includes('PRE-DELIVERY')) return 'hidden';
    if (c.includes('RIGGING KIT') || c.includes('HELM MASTER') || c.includes('ADD ON KITS')) return 'hidden';
    // v1.31 Step-5 curation (R-NEWBOAT / R-WORKSHOP): workshop operations
    // are not new-boat accessories — revealable via "Show all".
    if (c.includes('ENGINE REMOVAL')) return 'workshop';
    if (c.includes('SURVEYING SUBLET')) return 'workshop';

    // Any section naming a brand is brand/model-scoped (NEW-1 residual:
    // digitless, rangeless 'TUBE COVER OPTIONS - To suit Highfield
    // Boats' was 'general' and leaked onto Surtees/Stacer hulls).
    if (BRAND_WORD_RE.test(c)) return 'model';
    if (c.includes('SPECIFIC OPTIONS')) return 'model';
    return 'general';
}

/** Does a model-scoped section belong to THIS boat? (FFR-24, verbatim.) */
export function modelSectionMatches(
    raw: string,
    ctx: Pick<CurationContext, 'modelName' | 'vendorName'>,
): boolean {
    const c = raw.toUpperCase();
    const modelName = ctx.modelName || '';
    const vendorNameUpper = (ctx.vendorName || '').toUpperCase();
    const modelDigits = (modelName.match(/(\d{3,4})/) || [])[1] || '';
    const modelRangeWord = RANGE_WORDS[modelName.slice(0, 2).toUpperCase()] || '';
    // Brand agreement first (NEW-1 defense-in-depth): a section naming
    // a brand only ever shows on that brand's hulls, whatever the
    // digits say ('HIGHFIELD - ZeroJet 700' never on a Surtees 700).
    const secBrand = (c.match(BRAND_WORD_RE) || [])[1] || '';
    if (secBrand && !vendorNameUpper.includes(secBrand)) return false;
    const secDigits = (c.match(/(\d{3,4})/) || [])[1] || '';
    const secRange = RANGE_WORD_LIST.find(w => c.includes(w)) || '';
    // A section naming a range only ever shows on that range (UI-1).
    if (secRange && secRange !== modelRangeWord) return false;
    // NEW-2 (per-boat-sets) — Roll-Up floor packs: the section's floor
    // keyword must agree with the model code's floor designation
    // (RU230KAM = Airmat, RU230AL = Aluminium; 'Easy Go' models carry
    // neither suffix and see neither floor pack).
    const mUpper = modelName.toUpperCase();
    if (c.includes('AIRMAT') && !(/\dKAM\b/.test(mUpper) || mUpper.includes('AIRMAT'))) return false;
    if (c.includes('ALUMINIUM') && !(/\dAL\b/.test(mUpper) || mUpper.includes('ALUMINIUM'))) return false;
    // Digits present on both sides must agree.
    if (secDigits && modelDigits && secDigits !== modelDigits) return false;
    if (secDigits && modelDigits && secDigits === modelDigits) return true;
    // Range agrees, no digits ('HIGHFIELD - PATROL' on a PA boat).
    if (secRange && secRange === modelRangeWord) return true;
    // Brand-specific digitless, rangeless packs ('JEANNEAU SPECIFIC
    // OPTIONS', 'TUBE COVER OPTIONS - To suit Highfield Boats') —
    // brand↔vendor agreement was already enforced above.
    if (!secDigits && !secRange && secBrand) return true;
    if (!secDigits && !secRange && vendorNameUpper && c.includes(vendorNameUpper.split(' ')[0])) return true;
    return false;
}

// -------------------------------------------------------- section routing

export type SectionRoute = 'motor' | 'trailer' | null;

/**
 * Keyword routing on top of the module-config category lists
 * (motorModuleCategories / trailerModuleCategories): outboard-accessory,
 * tiller and prop sections belong under MOTOR dealer fit; trailer
 * accessories/setups under TRAILER dealer fit. Sections routed here no
 * longer render on the boat step.
 */
export function routeSection(raw: string): SectionRoute {
    const c = raw.toUpperCase();
    if (/\bOUTBOARD\b|\bTILLER\b|\bPROP(ELLER)?S?\b/.test(c)) return 'motor';
    if (/TRAILER\s+(ACCESSOR|SETUP|OPTION)/.test(c)) return 'trailer';
    return null;
}

// --------------------------------------------------- item-level relevance

export interface RelevanceRule {
    id: string;
    summary: string;
    rationale: string;
}

/** Named rules — every id returned by itemRelevance appears here, and each
 *  has a harness suite + a USER_GUIDE entry so operators know why an item
 *  is hidden (and that "Show all" reveals it). */
export const RELEVANCE_RULES: RelevanceRule[] = [
    {
        id: 'R-SUBITEM',
        summary: '"Supply & Install -" prefixed rows are job-card sub-items',
        rationale: 'MPF workshop lines priced as components of a parent operation — never standalone-selectable on a customer quote.',
    },
    {
        id: 'R-NEWBOAT',
        summary: 'Engine-removal operations hidden on new-boat quotes',
        rationale: 'Removing an engine is a service/counter-quote operation; a new build has no engine to remove.',
    },
    {
        id: 'R-HP',
        summary: 'HP-scoped items must overlap the model motor envelope',
        rationale: 'Cowl covers / fuel lines / kits named for an HP band (F115, "up to 70HP", "115 to 225HP") cannot fit a hull whose motor envelope excludes that band.',
    },
    {
        id: 'R-LEN',
        summary: 'Length-scoped items within ±0.4 m of hull length',
        rationale: 'Tube covers etc. sized in metres only fit hulls of that length; ±0.4 m absorbs code-vs-LOA rounding. Range-named items ("3.6 to 4.5mtr") must span the hull length.',
    },
    {
        id: 'R-MATERIAL',
        summary: 'PVC/Hypalon-scoped items match the active variant material',
        rationale: 'A Hypalon tube cover does not fit a PVC hull; the variant picked on Step 1 decides which one is offered.',
    },
    {
        id: 'R-CONFIG',
        summary: 'Tiller-scoped items only on tiller-steer boats',
        rationale: "Tiller conversion/fitting kits make no sense on a remote-steer (console) build; the model's engConfiguration decides.",
    },
    {
        id: 'R-SIZE-TV',
        summary: 'Fixed TVs need a cabin — hull ≥ 7.0 m',
        rationale: 'A fixed television needs a cabin bulkhead; sub-7 m open boats and RIBs have nowhere to mount one.',
    },
    {
        id: 'R-SIZE-RADAR',
        summary: 'Radar (radomes) — hull ≥ 6.0 m',
        rationale: 'Radomes need a hardtop/power tower and an offshore-capable hull; not offered under 6 m.',
    },
    {
        id: 'R-SIZE-UWLIGHT',
        summary: 'Underwater lights — hull ≥ 5.0 m',
        rationale: 'Transom underwater lights suit larger moored/trailer boats; not offered on sub-5 m tenders.',
    },
    {
        id: 'R-SIZE-EREEL',
        summary: 'Electric-reel wiring — hull ≥ 6.0 m',
        rationale: 'Electric game reels are offshore fishing gear; wiring circuits are not offered under 6 m.',
    },
];

/** Big-ticket size thresholds (metres). Documented in RELEVANCE_RULES. */
export const SIZE_CLASS_RULES: Array<{ id: string; pattern: RegExp; minHullM: number }> = [
    { id: 'R-SIZE-TV', pattern: /\bTVS?\b|TELEVISION/i, minHullM: 7.0 },
    { id: 'R-SIZE-RADAR', pattern: /RADOME|\bRADAR\b|\bFANTOM\b|\bGMR\s?\d/i, minHullM: 6.0 },
    { id: 'R-SIZE-UWLIGHT', pattern: /UNDERWATER\s+LIGHT/i, minHullM: 5.0 },
    { id: 'R-SIZE-EREEL', pattern: /ELECTRIC\s+REELS?/i, minHullM: 6.0 },
];

/** Parse every HP reference in an item name into [lo, hi] intervals.
 *  Conservative on purpose: bare numbers ("VHF115i", "GX700B") are NOT HP.
 *  Recognised: "NN to NNhp", "up to NNhp", "above NNhp", "NNhp", and
 *  Yamaha model codes (F115, VF150, XF425, T60, F9.9). */
export function parseHpIntervals(name: string): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const c = name.toUpperCase();
    let consumed = c;
    // Ranges first so their endpoints aren't re-read as singles.
    const range = /(\d{1,3}(?:\.\d)?)\s*(?:TO|-|–)\s*(\d{1,3}(?:\.\d)?)\s*HP\b/g;
    let m: RegExpExecArray | null;
    while ((m = range.exec(c))) {
        out.push([parseFloat(m[1]), parseFloat(m[2])]);
        consumed = consumed.replace(m[0], ' ');
    }
    const upTo = /UP\s*TO\s*(\d{1,3}(?:\.\d)?)\s*HP\b/g;
    while ((m = upTo.exec(consumed))) {
        out.push([0, parseFloat(m[1])]);
        consumed = consumed.replace(m[0], ' ');
    }
    const above = /ABOVE\s*(\d{1,3}(?:\.\d)?)\s*HP\b/g;
    while ((m = above.exec(consumed))) {
        out.push([parseFloat(m[1]), Infinity]);
        consumed = consumed.replace(m[0], ' ');
    }
    const single = /(\d{1,3}(?:\.\d)?)\s*HP\b/g;
    while ((m = single.exec(consumed))) out.push([parseFloat(m[1]), parseFloat(m[1])]);
    // Yamaha engine codes. \b keeps MF795 / GX700 / GT56 out (boundary
    // sits before the leading letter, so the F/T must start the token).
    // Slash lists expand ("F225/250/300" → 225, 250, 300; "F8/9.9" → 8, 9.9).
    const code = /\b(?:XF|VF|F|T)(\d{1,3}(?:\.\d)?)[A-Z]*((?:\/(?:XF|VF|F|T)?\d{1,3}(?:\.\d)?[A-Z]*)*)/g;
    while ((m = code.exec(c))) {
        out.push([parseFloat(m[1]), parseFloat(m[1])]);
        for (const part of (m[2] || '').split('/').filter(Boolean)) {
            const n = parseFloat(part.replace(/^(XF|VF|F|T)/, ''));
            if (Number.isFinite(n)) out.push([n, n]);
        }
    }
    return out;
}

/** Words that mean a metre figure is a COMPONENT dimension, not a hull
 *  length ("+ 1.8mtr Aerial", "6mtr Cable") — those never length-scope an
 *  item to a boat. */
const COMPONENT_LENGTH_WORDS = /^\s*(AERIAL|ANTENNA|CABLE|HARNESS|LEAD|HOSE|POLE|EXTENSION|STRAP|ROPE|CHAIN|WIRE|LANYARD|COATED|SENSOR|TRANSDUCER|LOOM)/;

/** Parse metre references: single "5.6 Mtr" values and "3.6 to 4.5mtr"
 *  ranges. Deliberately requires a MTR/METRE token — bare "m" would false-
 *  positive on aerials ("1.8m Aerial") and "183mm". Metre figures followed
 *  by a component word ("1.8mtr Aerial") are accessory dimensions and are
 *  skipped. */
export function parseLengthSpec(name: string): { single?: number; range?: [number, number] } {
    const c = name.toUpperCase();
    const range = c.match(/(\d+(?:\.\d+)?)\s*(?:TO|-|–)\s*(\d+(?:\.\d+)?)\s*(?:MTRS?|METRES?)\b/);
    if (range && !COMPONENT_LENGTH_WORDS.test(c.slice((range.index || 0) + range[0].length))) {
        return { range: [parseFloat(range[1]), parseFloat(range[2])] };
    }
    const single = /(\d+(?:\.\d+)?)\s*(?:MTRS?|METRES?)\b/g;
    let m: RegExpExecArray | null;
    while ((m = single.exec(c))) {
        if (COMPONENT_LENGTH_WORDS.test(c.slice(m.index + m[0].length))) continue;
        return { single: parseFloat(m[1]) };
    }
    return {};
}

const LEN_TOLERANCE_M = 0.4;

export interface RelevanceResult {
    visible: boolean;
    /** RELEVANCE_RULES id that hid the item (undefined when visible). */
    rule?: string;
}

/**
 * Item-level relevance. Every rule fails OPEN: missing context (no hull
 * length, no envelope, no variant) never hides anything. The Step-5
 * "Show all" escape hatch bypasses this entirely.
 */
export function itemRelevance(name: string, ctx: CurationContext): RelevanceResult {
    const n = name || '';
    // R-SUBITEM — job-card sub-items are never standalone-selectable.
    if (/^\s*SUPPLY\s*&\s*INSTALL\b/i.test(n)) return { visible: false, rule: 'R-SUBITEM' };
    // R-NEWBOAT — no engine to remove on a new build.
    if (/\bENGINE\s+REMOVAL/i.test(n)) return { visible: false, rule: 'R-NEWBOAT' };
    // R-HP — any parsed HP interval must overlap the motor envelope.
    if (ctx.minHp != null && ctx.maxHp != null && ctx.maxHp > 0) {
        const intervals = parseHpIntervals(n);
        if (intervals.length > 0) {
            const overlaps = intervals.some(([lo, hi]) => hi >= ctx.minHp! && lo <= ctx.maxHp!);
            if (!overlaps) return { visible: false, rule: 'R-HP' };
        }
    }
    // R-LEN — metre-scoped items near the hull length.
    if (ctx.hullLengthM != null && ctx.hullLengthM > 0) {
        const spec = parseLengthSpec(n);
        if (spec.range) {
            const [lo, hi] = spec.range;
            if (ctx.hullLengthM < lo - 0.05 || ctx.hullLengthM > hi + 0.05) {
                return { visible: false, rule: 'R-LEN' };
            }
        } else if (spec.single != null) {
            if (Math.abs(spec.single - ctx.hullLengthM) > LEN_TOLERANCE_M + 1e-9) {
                return { visible: false, rule: 'R-LEN' };
            }
        }
    }
    // R-MATERIAL — PVC vs Hypalon scoped items follow the active variant.
    if (ctx.variantMaterial) {
        const mat = ctx.variantMaterial.toUpperCase();
        const isHyp = mat.startsWith('HYP');
        const isPvc = mat === 'PVC';
        const namesPvc = /\bPVC\b/i.test(n);
        const namesHyp = /\bHYP(ALON)?\b/i.test(n);
        if (namesPvc !== namesHyp) { // exactly one material named
            if (namesPvc && isHyp) return { visible: false, rule: 'R-MATERIAL' };
            if (namesHyp && isPvc) return { visible: false, rule: 'R-MATERIAL' };
        }
    }
    // R-CONFIG — tiller items only on tiller-steer boats.
    if (ctx.engConfiguration && /\bTILLER\b/i.test(n)) {
        if (!/TILLER/i.test(ctx.engConfiguration)) return { visible: false, rule: 'R-CONFIG' };
    }
    // R-SIZE-* — big-ticket gear gated on hull length class.
    if (ctx.hullLengthM != null && ctx.hullLengthM > 0) {
        for (const rule of SIZE_CLASS_RULES) {
            if (rule.pattern.test(n) && ctx.hullLengthM < rule.minHullM) {
                return { visible: false, rule: rule.id };
            }
        }
    }
    return { visible: true };
}

// ------------------------------------------------ model-pack variant rows

/** Colour word → code initials ("Light Grey" → LG, "White" → W). */
function colourInitials(word: string): string {
    return word.trim().split(/\s+/).map(w => w.charAt(0)).join('').toUpperCase();
}

/** "CL380 — White / White / Wood Dark" → ['W', 'W', 'WD']. */
export function variantColourCodes(variantName?: string): string[] {
    if (!variantName) return [];
    const after = variantName.split(/—|–|:/).pop() || '';
    if (!after.includes('/')) return [];
    return after.split('/').map(colourInitials).filter(Boolean);
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface PackRow {
    id?: string;
    code?: string;
    name?: string;
}

/**
 * Per-SKU model-pack dedupe (finding #1): a model-scoped section holds one
 * row per material×colour SKU (all the same price) — show ONLY the row for
 * the ACTIVE variant.
 *
 * Primary match: the MPF part code embeds the variant SKU
 * (9HI_HBC 065_PD ↔ HBC065). Fallback: progressive name narrowing on
 * model token → material token → colour code, each step applied only when
 * it leaves at least one row (fail open — never produce an empty pack for
 * a boat the section legitimately targets).
 */
export function selectVariantRows<T extends PackRow>(rows: T[], ctx: CurationContext): T[] {
    if (rows.length <= 1) return rows;
    const sku = norm(ctx.variantSku || '');
    if (sku.length >= 4) {
        const bySku = rows.filter(r => norm(r.code || r.id || '').includes(sku));
        if (bySku.length > 0) return bySku;
    }
    if (!ctx.variantSku && !ctx.variantMaterial) return rows;
    let pool = rows;
    // Model token — exact match so CL380 doesn't swallow CL380LS packs.
    const modelTok = (String(ctx.modelName || '').toUpperCase().match(/\b[A-Z]{2,3}\d{3,4}[A-Z]*\b/) || [])[0];
    if (modelTok) {
        const byModel = pool.filter(r => {
            const toks: string[] = String(r.name || '').toUpperCase().match(/\b[A-Z]{2,3}\d{3,4}[A-Z]*\b/g) || [];
            return toks.includes(modelTok);
        });
        if (byModel.length > 0) pool = byModel;
    }
    // Material token.
    if (ctx.variantMaterial) {
        const isHyp = ctx.variantMaterial.toUpperCase().startsWith('HYP');
        const byMat = pool.filter(r => {
            const n = String(r.name || '');
            const namesPvc = /\bPVC\b/i.test(n);
            const namesHyp = /\bHYP(ALON)?\b/i.test(n);
            if (!namesPvc && !namesHyp) return false;
            return isHyp ? namesHyp : namesPvc;
        });
        if (byMat.length > 0) pool = byMat;
    }
    // Colour code — compare the leading segments both sides share.
    const want = variantColourCodes(ctx.variantName);
    if (want.length > 0) {
        const byColour = pool.filter(r => {
            const seg = (String(r.name || '').toUpperCase().match(/\b([A-Z]{1,2}(?:-[A-Z]{1,3})+)\s*$/) || [])[1];
            if (!seg) return false;
            const codes = seg.split('-');
            const nShared = Math.min(codes.length, want.length);
            for (let i = 0; i < nShared; i++) if (codes[i] !== want[i]) return false;
            return true;
        });
        if (byColour.length > 0) pool = byColour;
    }
    return pool;
}

// ----------------------------------------------------- display prettifier

/** Known MPF section headings → operator/customer display names. Original
 *  heading stays available via the card/heading title attribute. */
export const SECTION_DISPLAY_NAMES: Record<string, string> = {
    'BATTERY INSTALLATIONS': 'Batteries & Power',
    'ENGINE REMOVALS': 'Workshop — Engine Removals',
    'FRESHWATER PLUMBING OPTIONS': 'Plumbing & Freshwater',
    'FUSION STEREO OPTIONS': 'Audio — Fusion',
    'GARMIN ELECTRONIC OPTIONS': 'Electronics — Garmin',
    'LONESTAR WINCH OPTIONS': 'Anchor Winches — Lonestar',
    'LOWRANCE ELECTRONIC OPTIONS': 'Electronics — Lowrance',
    'MAJESTIC TV OPTIONS': 'TV & Entertainment',
    'MINN KOTA MOTOR OPTIONS': 'Electric Motors — Minn Kota',
    'MOMENTUM - ELECTRIC MOTOR PACKS': 'Electric Motors — Momentum',
    'MPF – UNCATEGORISED': 'VHF Radios & Safety',
    'MPF - UNCATEGORISED': 'VHF Radios & Safety',
    'NAVICO ELECTRONIC OPTIONS': 'Electronics — Navico',
    'OUTBOARD ACCESSORIES': 'Outboard Accessories',
    'RAYMARINE ELECTRONIC OPTIONS': 'Electronics — Raymarine',
    'SARCA ANCHOR INSTALLS': 'Anchoring — Sarca',
    'SIMRAD ELECTRONIC OPTIONS': 'Electronics — Simrad',
    'SOLAR SETUPS': 'Solar Power',
    'SURVEYING SUBLETS': 'Workshop — Survey Sublets',
    'TILLER FITTING KITS': 'Tiller Conversion Kits',
    'TRAILER SETUPS': 'Trailer Setup & Adjustment',
    'TUBE COVER OPTIONS - TO SUIT HIGHFIELD BOATS': 'Tube Covers',
};

/** Supplier-name prefixes stripped by the generic fallback. */
const SUPPLIER_PREFIX_RE = /^(MAJESTIC|GARMIN|LOWRANCE|SIMRAD|RAYMARINE|NAVICO|FUSION|LONESTAR|MINN KOTA|SARCA|MOMENTUM)\s+/i;

function titleCase(s: string): string {
    return s.toLowerCase().replace(/(^|[\s\-—(/])([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
}

/**
 * Display name for a raw MPF section heading. Known headings map via
 * SECTION_DISPLAY_NAMES; model packs ('HIGHFIELD - Classic 380') become
 * 'Boat Pack — Classic 380'; everything else falls back to title-case with
 * the supplier prefix stripped. Callers keep `raw` in a title/tooltip attr.
 */
export function prettifySectionName(raw: string): string {
    const key = raw.trim().toUpperCase();
    if (SECTION_DISPLAY_NAMES[key]) return SECTION_DISPLAY_NAMES[key];
    // Model packs: 'HIGHFIELD - Classic 380' / 'Highfield - Ultralite 240'.
    const pack = key.match(/^(HIGHFIELD|STACER|STABICRAFT|SURTEES|JEANNEAU|FORMOSA|HAINES)\s*-\s*(.+)$/);
    if (pack) return `Boat Pack — ${titleCase(pack[2])}`;
    const stripped = raw.trim().replace(SUPPLIER_PREFIX_RE, '');
    return titleCase(stripped);
}
