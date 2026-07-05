/**
 * customer-note.ts (v1.24 — Story 1.5.3).
 *
 * Customer notes timeline. Notes live at
 *   customers/{customerId}/notes/{noteId}
 * and the parent customer.notesCount is kept in sync via increment.
 *
 * IMPORTANT: new Firestore path customers/{id}/notes/{noteId}. Rule +
 * rules-deployed test cover it.
 */

export type CustomerNoteKind = 'note' | 'call' | 'email' | 'meeting' | 'system';

export const NOTE_KIND_LABEL: Record<CustomerNoteKind, string> = {
    note: 'Note',
    call: 'Phone call',
    email: 'Email',
    meeting: 'Meeting',
    system: 'System',
};

export interface CustomerNote {
    id: string;
    customerId: string;
    kind: CustomerNoteKind;
    body: string;
    createdAt: any;
    createdByUid: string;
    createdByName: string;
}

/** Sort notes newest-first for the timeline render. */
export function sortNotesDesc(notes: CustomerNote[]): CustomerNote[] {
    const ms = (t: any) => t?.toDate?.()?.getTime?.() ?? (t?.seconds ? t.seconds * 1000 : (typeof t === 'number' ? t : 0));
    return [...(notes ?? [])].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}
