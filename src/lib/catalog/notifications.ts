/**
 * notifications.ts (v1.30 — Stories 10.1.1-10.1.5).
 *
 * Notification system foundation extending the existing
 * users/{uid}/notifications subcollection. Builders for each trigger:
 * quote-viewed, quote-expiring, contract-milestone, deposit-due.
 */
export type NotificationType = 'quote-viewed' | 'quote-expiring' | 'contract-milestone' | 'deposit-due' | 'general';
export interface AppNotification {
    id: string;
    type: NotificationType;
    title: string;
    body?: string;
    link?: string;
    read: boolean;
    createdAt: any;
}
export function buildNotification(type: NotificationType, title: string, opts: { body?: string; link?: string } = {}): Omit<AppNotification, 'id' | 'createdAt'> {
    return { type, title, body: opts.body, link: opts.link, read: false };
}
export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
    'quote-viewed': 'Quote viewed', 'quote-expiring': 'Quote expiring',
    'contract-milestone': 'Contract milestone', 'deposit-due': 'Deposit due', 'general': 'Notification',
};
export function unreadCount(ns: AppNotification[]): number { return (ns ?? []).filter(n => !n.read).length; }
