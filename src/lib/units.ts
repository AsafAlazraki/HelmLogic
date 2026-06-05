/**
 * Unit-format helpers — defensive against source data that stores metric
 * fields as raw centimetres instead of metres (e.g. a GFAB trailer doc
 * has `boatSizeMtr: 600` meaning 6.00m). Auto-detects + normalises so
 * the PDF/proposal never shows "600 m".
 */

/** Format a metres value. Auto-detects cm-as-metres for recreational
 *  marine values: anything ≥ 50 must be cm (no rec boat/trailer is over
 *  50m). For values in the 100-9999 range, treats as cm. Values 50-100
 *  are ambiguous but extremely rare for marine, so we treat >= 50 as cm. */
export function formatMetres(v: unknown, opts: { unit?: string; decimals?: number } = {}): string {
    const m = asMetres(v);
    if (m == null) return '—';
    const unit = opts.unit ?? 'm';
    const decimals = opts.decimals ?? (m >= 10 ? 1 : 2);
    return `${m.toFixed(decimals)} ${unit}`.trim();
}

/** Same auto-detect, returns the numeric value in metres (no unit). */
export function asMetres(v: unknown): number | null {
    const n = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : NaN);
    if (!Number.isFinite(n)) return null;
    // Marine-domain tiered heuristic — recreational boats/trailers are
    // always 3-15m. Anything outside that range is mis-encoded.
    //  - 0–15    → already in metres ✓ (5.7m boat, 12m yacht)
    //  - 15–50   → ÷10 (e.g. lengthMtr: 42.4 → 4.24m for Dunbier 4M-13SL)
    //  - 50+     → ÷100 (e.g. boatSizeMtr: 600 → 6.00m for GFAB PA600)
    if (n >= 50) return n / 100;
    if (n > 15) return n / 10;
    return n;
}
