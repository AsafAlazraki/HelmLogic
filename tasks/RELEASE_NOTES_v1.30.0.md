# v1.30 — Notification system foundation

**Date**: 2026-06-29 · **Branch**: dev → main · 5 stories shipped.

## Shipped
- **10.1.1 Notification System Foundation** — `notifications.ts` on top of the existing `users/{uid}/notifications` subcollection; a typed `AppNotification` shape, a `buildNotification()` builder, per-type labels, and `unreadCount()` for the badge (lib).
- **10.1.2 Quote-Viewed Notification** — `quote-viewed` trigger type so a salesperson learns when a customer opens their quote.
- **10.1.3 Quote-Expiring Notification** — `quote-expiring` trigger type, pairing with the v1.20 expiry logic to warn before a quote lapses.
- **10.1.4 Contract Milestone Notification** — `contract-milestone` trigger type for order-tracking / milestone events on a live contract.
- **10.1.5 Deposit-Due Notification** — `deposit-due` trigger type driven by the v1.23 payment schedule so an upcoming deposit isn't missed.

## After merge
Run `scripts/ship-buildable-remainder.py`.
