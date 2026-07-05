/**
 * quote-versioning.ts (v1.25 — Story 1.4.5).
 *
 * Group a customer's quotes into version chains. A "version" is a quote
 * that shares a rootQuoteId (set when a quote is duplicated/forked) or,
 * lacking that, quotes for the same customer+model. Helpers compute the
 * latest version + the full ordered history for the comparison tool.
 */

export interface VersionableQuote {
    id: string;
    rootQuoteId?: string | null;
    version?: number | null;
    customerId?: string | null;
    createdAt?: any;
}

function toMs(t: any): number {
    if (!t) return 0;
    if (typeof t === 'number') return t;
    if (typeof t?.toDate === 'function') return t.toDate().getTime();
    if (typeof t?.seconds === 'number') return t.seconds * 1000;
    return 0;
}

/** Group quotes into version chains keyed by rootQuoteId (or own id). */
export function groupVersionChains<T extends VersionableQuote>(quotes: T[]): Record<string, T[]> {
    const chains: Record<string, T[]> = {};
    for (const q of quotes ?? []) {
        const key = q.rootQuoteId || q.id;
        (chains[key] ??= []).push(q);
    }
    for (const key of Object.keys(chains)) {
        chains[key].sort((a, b) => {
            const va = a.version ?? 0, vb = b.version ?? 0;
            if (va !== vb) return va - vb;
            return toMs(a.createdAt) - toMs(b.createdAt);
        });
    }
    return chains;
}

/** Latest version in a chain (highest version / newest). */
export function latestInChain<T extends VersionableQuote>(chain: T[]): T | null {
    if (!chain || chain.length === 0) return null;
    return chain[chain.length - 1];
}

/** Next version number for a chain. */
export function nextVersionNumber<T extends VersionableQuote>(chain: T[]): number {
    const max = (chain ?? []).reduce((m, q) => Math.max(m, q.version ?? 0), 0);
    return max + 1;
}
