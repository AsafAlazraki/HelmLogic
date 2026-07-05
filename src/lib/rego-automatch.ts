/**
 * Rego auto-match helpers (2026-07-04 fleet-walk handoff).
 *
 * Two field-reported bugs live here as pure, unit-tested logic:
 *
 * 1. Hull-length parsing (parseBoatLengthM): the quote flow derived hull
 *    length from the FIRST 3-digit group in the model code — MPF part-number
 *    style codes (HBS113) parsed as 1.13 m nonsense and auto-matched the
 *    smallest QLD rego band. Specs are now authoritative; the code fallback
 *    only trusts a known Highfield range prefix (CL380 → 3.80 m) or a
 *    STANDALONE 3-digit token ("Coaster 540", "Stacer - 409 Assault Pro"),
 *    never digits glued inside a SKU.
 *
 * 2. Band preference (pickAutoRegoBand): the QLD catalog contains BOTH the
 *    legacy seeded bands (v1.4, e.g. 'Recreational Vessel — 4.5m to 8m'
 *    $163) and the MPF-imported bands (v1.31, e.g. '4.51m to 6.0m' $250).
 *    Both match a 5.6 m hull; first-in-load-order used to win. MPF bands
 *    (doc id 'mpf-*') are NSM's source of truth and now win over legacy
 *    seeds, and pensioner/concession bands are NEVER auto-applied (operator
 *    must pick them deliberately — they remain manually selectable).
 */

export interface RegoBandType {
    id: string;
    name: string;
    minLengthM?: number;
    maxLengthM?: number;
    minAtmKg?: number;
    maxAtmKg?: number;
}

export interface RegoBandOption<T extends RegoBandType = RegoBandType> {
    key: string;
    type: T;
}

/** Known Highfield range prefixes — model codes like CL380 encode
 *  length×100 and are safe to parse. */
const RANGE_PREFIX_RE = /^(CL|SP|RU|UL|PA|AL|AD|CO)\d{3}/;

/** Hull length (m) from model specs + model code/name candidates.
 *  Order: (1) a Length spec row (authoritative, MPF/UI-entered);
 *  (2) range-prefixed Highfield code (CL380 → 3.8, RU230KAM → 2.3);
 *  (3) a SPACE-BOUNDED 3-digit token in a candidate ("Coaster 540" → 5.4,
 *      "Surtees - 770 Game Fisher" → 7.7).
 *  SKU/part-number style codes (HBS113, SUR-770GF-261) deliberately parse
 *  as NOTHING rather than 1.13 m / 2.61 m nonsense — no rego auto-match is
 *  better than a wrong one. */
export function parseBoatLengthM(
    candidates: Array<string | undefined>,
    otherSpecs?: Array<{ label?: string; value?: unknown }>,
): number | undefined {
    const spec = (otherSpecs || []).find(s => /length/i.test(String(s?.label || '')));
    if (spec) {
        const m = String(spec.value ?? '').match(/(\d+(?:\.\d+)?)/);
        if (m) {
            const v = parseFloat(m[1]);
            // Specs may be in mm ("5600") or cm on some imports — normalise.
            const norm = v > 1000 ? v / 1000 : v > 30 ? v / 100 : v;
            if (norm >= 1.5 && norm <= 30) return norm;
        }
    }
    const list = candidates.map(c => String(c || '').toUpperCase()).filter(Boolean);
    for (const code of list) {
        if (RANGE_PREFIX_RE.test(code)) {
            const m = code.match(/(\d{3})/);
            if (m) return parseInt(m[1], 10) / 100;
        }
    }
    for (const code of list) {
        const standalone = code.match(/(?:^|\s)(\d{3})(?:\s|$)/);
        if (standalone) return parseInt(standalone[1], 10) / 100;
    }
    return undefined;
}

/** Auto-match preference score. -1 = never auto-apply. */
function bandScore(t: RegoBandType): number {
    if (/PENSIONER|CONCESSION/i.test(t.name || '')) return -1;
    return t.id.startsWith('mpf-') ? 2 : 1;
}

/**
 * Pick the band to auto-apply for a boat length / trailer ATM context.
 * Returns undefined when nothing matches or only concession bands match.
 */
export function pickAutoRegoBand<T extends RegoBandType>(
    options: Array<RegoBandOption<T>>,
    ctx: { lengthM?: number; atmKg?: number },
): RegoBandOption<T> | undefined {
    const { lengthM, atmKg } = ctx;
    if (lengthM == null && atmKg == null) return undefined;
    const hits = options.filter(o => {
        const t = o.type;
        if (lengthM != null && t.minLengthM != null && t.maxLengthM != null) {
            if (lengthM >= t.minLengthM && lengthM < t.maxLengthM) return true;
        }
        if (atmKg != null && t.minAtmKg != null && t.maxAtmKg != null) {
            if (atmKg >= t.minAtmKg && atmKg <= t.maxAtmKg) return true;
        }
        return false;
    });
    let best: RegoBandOption<T> | undefined;
    let bestScore = 0;
    for (const o of hits) {
        const s = bandScore(o.type);
        if (s > bestScore) { best = o; bestScore = s; }
    }
    return best;
}
