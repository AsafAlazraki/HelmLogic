/**
 * Unit-format helpers — defensive against source data that stores metric
 * fields as raw centimetres instead of metres (e.g. a GFAB trailer doc
 * has `boatSizeMtr: 600` meaning 6.00m). Auto-detects + normalises so
 * the PDF/proposal never shows "600 m".
 */

/** Format a metres value. Auto-detects cm-as-metres (anything > 50, since
 *  no recreational boat/trailer exceeds 50m) and divides by 100. */
export function formatMetres(v: unknown, opts: { unit?: string; decimals?: number } = {}): string {
    const unit = opts.unit ?? 'm';
    const n = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : NaN);
    if (!Number.isFinite(n)) return '—';
    const metres = n > 50 ? n / 100 : n;
    const decimals = opts.decimals ?? (metres >= 10 ? 1 : 2);
    return `${metres.toFixed(decimals)} ${unit}`.trim();
}

/** Same auto-detect, returns the numeric value in metres (no unit). */
export function asMetres(v: unknown): number | null {
    const n = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : NaN);
    if (!Number.isFinite(n)) return null;
    return n > 50 ? n / 100 : n;
}
