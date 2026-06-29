/**
 * comms-log.ts (v1.25 — Story 1.6.1).
 *
 * Unified interaction timeline for a customer: notes + quote-sends +
 * variation-sends + acceptance events, merged into one chronological
 * feed. The Comms Log doesn't store its own docs — it MERGES existing
 * sources (customer notes, quote audit events) into a single sorted view.
 */

export type CommsChannel = 'note' | 'quote-sent' | 'variation-sent' | 'accepted' | 'deposit' | 'contract';

export interface CommsEntry {
    id: string;
    channel: CommsChannel;
    label: string;
    detail?: string;
    at: number; // ms epoch for stable sort
    byName?: string;
}

export const CHANNEL_LABEL: Record<CommsChannel, string> = {
    'note': 'Note',
    'quote-sent': 'Quote sent',
    'variation-sent': 'Variation sent',
    'accepted': 'Accepted',
    'deposit': 'Deposit',
    'contract': 'Contract',
};

function toMs(t: any): number {
    if (!t) return 0;
    if (typeof t === 'number') return t;
    if (typeof t?.toDate === 'function') return t.toDate().getTime();
    if (typeof t?.seconds === 'number') return t.seconds * 1000;
    return 0;
}

/**
 * Merge notes + quote audit events into one sorted comms timeline.
 * Pure function — caller supplies the already-fetched source arrays.
 */
export function buildCommsLog(input: {
    notes?: Array<{ id: string; body?: string; createdByName?: string; createdAt?: any }>;
    quoteEvents?: Array<{ id: string; type?: string; byName?: string; timestamp?: any; note?: string }>;
}): CommsEntry[] {
    const entries: CommsEntry[] = [];
    for (const n of input.notes ?? []) {
        entries.push({ id: `note-${n.id}`, channel: 'note', label: 'Note', detail: n.body, at: toMs(n.createdAt), byName: n.createdByName });
    }
    for (const e of input.quoteEvents ?? []) {
        const channel: CommsChannel =
            e.type === 'sent' ? 'quote-sent'
            : e.type === 'variation' ? 'variation-sent'
            : e.type === 'accepted' ? 'accepted'
            : e.type === 'margin-override' ? 'contract'
            : 'contract';
        entries.push({ id: `evt-${e.id}`, channel, label: CHANNEL_LABEL[channel], detail: e.note, at: toMs(e.timestamp), byName: e.byName });
    }
    return entries.sort((a, b) => b.at - a.at);
}
