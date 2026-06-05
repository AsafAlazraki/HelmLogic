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
    // Marine-domain four-tier heuristic. Source trailer/boat data stores
    // length fields in 4 different formats across vendors — we detect by
    // magnitude since rec boats/trailers are always 3-15m:
    //   < 15       → already in metres ✓        (5.7m boat, 3.9m trailer)
    //   15–49      → decimal misplaced, ÷10     (42.4 means 4.24m on old Dunbier)
    //   50–999     → centimetres, ÷100          (600 means 6.00m on GFAB PA600)
    //   ≥ 1000     → millimetres, ÷1000         (4240 means 4.24m on Dunbier Sports)
    if (n >= 1000) return n / 1000;
    if (n >= 50)   return n / 100;
    if (n > 15)    return n / 10;
    return n;
}
