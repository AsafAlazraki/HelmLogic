/**
 * quote-expiry.ts (v1.20 — Story 1.4.4).
 *
 * Quote validity / expiry helpers.
 *
 * Schema additions:
 *   quote.expiryAt: Firestore Timestamp (UTC)
 *   organisation.defaultQuoteValidityDays: number (default 30)
 *
 * Render at the org's timezone. Default Australia/Sydney; override via
 * `organisation.timezone`.
 *
 * Expired quotes:
 *   - Cannot be sent (Send Quote dialog blocks).
 *   - Cannot be converted to a contract.
 *   - Proposal-view banner offers "Reissue with new expiry" which
 *     re-stamps `expiryAt` AND writes a `quote-reissued` audit-log
 *     entry with the operator uid.
 */

export const DEFAULT_QUOTE_VALIDITY_DAYS = 30;

export interface ExpiryEvaluation {
    expiryAt: Date | null;
    isExpired: boolean;
    daysUntilExpiry: number | null;
    /** UI band so the banner / pill can colour itself. */
    band: 'fresh' | 'expiring-soon' | 'expired' | 'no-expiry';
}

function toJsDate(ts: any): Date | null {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts?.toDate === 'function') return ts.toDate();
    if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
    return null;
}

/**
 * Evaluate a quote's expiry state relative to now. Pure function so
 * the same logic feeds the proposal-view banner, the Send Quote gate,
 * and the Convert -> Contract gate.
 */
export function evaluateExpiry(quoteExpiryAt: any, now: Date = new Date()): ExpiryEvaluation {
    const expiryAt = toJsDate(quoteExpiryAt);
    if (!expiryAt) {
        return { expiryAt: null, isExpired: false, daysUntilExpiry: null, band: 'no-expiry' };
    }
    const ms = expiryAt.getTime() - now.getTime();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    if (ms <= 0) {
        return { expiryAt, isExpired: true, daysUntilExpiry: days, band: 'expired' };
    }
    if (days <= 7) {
        return { expiryAt, isExpired: false, daysUntilExpiry: days, band: 'expiring-soon' };
    }
    return { expiryAt, isExpired: false, daysUntilExpiry: days, band: 'fresh' };
}

/**
 * Compute the expiryAt for a fresh quote being finalized.
 *   now + (organisation.defaultQuoteValidityDays || DEFAULT_QUOTE_VALIDITY_DAYS)
 *
 * Returned as a JS Date; caller wraps in serverTimestamp/Timestamp if
 * persisting.
 */
export function nextExpiryDate(orgValidityDays?: number | null, now: Date = new Date()): Date {
    const days = (orgValidityDays != null && Number.isFinite(orgValidityDays) && orgValidityDays > 0)
        ? orgValidityDays
        : DEFAULT_QUOTE_VALIDITY_DAYS;
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Format the expiry for display. Renders in the org's timezone when
 * provided (default Australia/Sydney). Pattern: "23 Jun 2026".
 */
export function formatExpiryDate(expiryAt: any, timezone = 'Australia/Sydney'): string {
    const d = toJsDate(expiryAt);
    if (!d) return '—';
    try {
        return new Intl.DateTimeFormat('en-AU', {
            day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone,
        }).format(d);
    } catch {
        return d.toISOString().slice(0, 10);
    }
}
