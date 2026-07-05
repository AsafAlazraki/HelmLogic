# v1.30 — User Guide

| Want to | Where |
|---|---|
| Know when a customer opens a quote | Notifications |
| Be warned before a quote expires | Notifications |
| Track contract milestones | Notifications |
| Not miss a deposit that's due | Notifications |

**Notifications**: this release lays the notification foundation. Each notification is typed and lands in your own notifications feed with an unread count on the badge. Four triggers are wired: a quote being viewed by the customer, a quote about to expire, a contract milestone being reached, and a deposit falling due.

**What this affects**: notifications are per user, so you only see what's relevant to your deals. The delivery surfaces (in-app feed, and later email/push once SMTP is signed off) build on this foundation; the trigger plumbing and unread-count logic are in place now.
