# HelmLogic v1.8 — User Guide

> Audience: org admins + salespeople using the v1.8 quote-lifecycle features.
> Companion to: `tasks/RELEASE_NOTES_v1.8.0.md` (engineering changelog).
>
> **Backfill note**: v1.8 originally shipped without a user guide — this document was written retroactively when v1.9 caught the omission. Captures the same operator workflows that v1.8 introduced in May 2026. For features added since (lifecycle states, scenarios, preview sheet, SharePoint), see `USER_GUIDE_v1.9.0.md`.

This guide walks through every operator-facing capability v1.8 added. If you're reading the in-app **Feature Tracking → Release Notes** tab, those notes are the engineering summary; this is the practical "how do I use it" version.

---

## At-a-glance map

| What you want to do | Where to do it | Section |
|---|---|---|
| Email a customer quote with the PDF attached | Proposal header → **Send Quote** button | [Send Quote](#1-send-quote--email-the-pdf-to-the-customer) |
| Author / edit email templates the Send dialog uses | `/manage` → **Document Templates** → Email tab | [Email Templates](#2-email-templates--what-the-customer-receives) |
| Stop a sent quote from being silently edited | Auto — first Send locks the quote | [Quote Lock](#3-quote-lock--read-only-after-send) |
| Edit a locked quote anyway | Try editing → **Create v2** popup | [Fork-on-Edit](#4-fork-on-edit--make-a-new-version-of-a-locked-quote) |
| See every action taken on a quote (who did what, when) | Proposal header → **Activity** button | [Activity Tab](#5-activity-tab--full-audit-trail) |
| Customise a content block for ONE customer without changing the org default | Proposal header → **Personalise** button | [Personalise Content](#6-personalise-content--per-quote-content-overrides) |
| Stop salespeople overriding the org-default version of a critical block | Block editor → **Lock for quotes** toggle | [Locking Blocks](#7-lock-for-quotes--admin-only-content) |
| Back up / restore / transfer all content blocks (JSON) | `/manage` → Document Templates → **Import / Export** | [Content Block I/O](#8-content-block-import--export) |
| Roll a content block back to a previous version | Block editor → **History** → **Compare with current** | [Version History](#9-version-history-polish) |

---

## 1. Send Quote — email the PDF to the customer

The headline v1.8 feature. The **Send Quote** button in the proposal toolbar opens a dialog where you compose the email, pick a template, and dispatch the customer-facing PDF in one action.

### To send a quote

1. Open the quote in the proposal view
2. Click **Send Quote** (paper-plane icon) in the top-right toolbar
3. The Send dialog opens with:
   - **Template** selector — pick which email template to use (see [Email Templates](#2-email-templates--what-the-customer-receives))
   - **To** field — pre-filled from `quote.customer.email` if set; editable
   - **CC** + **BCC** — comma- or newline-separated email addresses
   - **Subject** — rendered from the selected template's subject with `{{customerName}}` etc. token replacement
   - **Body** — rendered HTML preview of the template body, same token replacement
4. Click **Send** at the bottom-right
5. Toast confirms: "Quote sent" (or "Quote sent · quote locked at v1" on the first send — see [Lock](#3-quote-lock--read-only-after-send))
6. The customer receives the email within ~60 seconds; the PDF is attached, byte-for-byte identical to what the Preview sheet shows

### What happens behind the scenes

- The PDF is rendered locally via the v1.5.0 single-source pipeline (same render as Download)
- A record is written to `users/{ownerUid}/quotes/{quoteId}/sentEmails/{sendId}` capturing recipient, frozen subject/body, PDF storage path, and FK into the `mail/{id}` queue for delivery tracking
- `quote.lastSentAt` + `quote.sentCount` are denormalised on the quote doc so the proposal header can show "last sent 3 days ago" at a glance
- If this is the **first** send, the quote auto-locks (see below)
- An audit-log entry is captured: `eventType: 'sent'` with the `sentEmailId` metadata

### When the Send button is disabled

- `NEXT_PUBLIC_EMAIL_SEND_ENABLED=false` (the env flag — your HelmLogic admin controls this; flip happens after stakeholder approval on the sender domain + provider)
- The quote has no `customer.email` set
- The quote is a stock item (mode = inventory, not customer)

Hover over the disabled button for a tooltip explaining which gate is failing.

### Tips

- **Pick the right template** — Quote / Contract / Follow-up templates appear in the dropdown; templates the org admin has saved at the per-org level are what's available
- **The PDF is frozen at send time** — re-sending the quote later re-renders against the current quote payload (so if you edited content overrides, the customer sees the new version on re-send). For an immutable copy, see [SharePoint Mirror](USER_GUIDE_v1.9.0.md) (v1.9+)
- **Sent records are immutable** — once the email is queued, you can't edit the subject or body retroactively. Send again with the corrected content if you need to fix something

---

## 2. Email Templates — what the customer receives

v1.8 shipped an org-level email template manager so you (or your admin) authors the subject + body once and reuses it for every customer. Templates support token replacement so each email feels personalised.

### Template types

| Type | When to use |
|---|---|
| **Send quote** | The primary customer-facing template — used when you click Send Quote on a customer proposal |
| **Send contract** | When the quote progresses to a formal contract send (typically post-acceptance) |
| **Follow-up** | Reminders / nudges to a customer who hasn't responded |

### To author a template

1. Open `/manage` → **Document Templates** tab → **Email** sub-tab
2. Pick a template type (or create a new one with the **+ New template** button)
3. Edit the **Subject** field (rich-text not allowed — plain text only)
4. Edit the **Body** field in the rich-text editor
5. Use tokens: `{{customerName}}`, `{{quoteNumber}}`, `{{senderName}}`, `{{senderEmail}}`, `{{orgName}}` — replaced at send time with the actual values for the quote
6. Save — changes apply to the next Send action that picks this template

### Tips

- **One template per type per org** for v1.8 (multi-template selection inside a type lands in v1.9+ if needed)
- **Test before sending live** — there's no preview surface today for email rendering. Send a test quote to your own inbox first
- **Token typos are silent** — `{{custmerName}}` (typo) won't be replaced. Double-check tokens against the canonical list before saving

---

## 3. Quote Lock — read-only after Send

The moment a quote is first sent, it auto-locks. This prevents salespeople from silently editing the content under a customer who's already seen the previous version. A locked quote is read-only at the database layer (Firestore rules enforce it — not just a UI hide) and visually marked with an amber **Locked** badge in the header.

### What the lock blocks

- Editing the quote payload (selected options, motors, trailers, dealer fit, pricing)
- Re-applying discounts
- Changing the customer details

### What the lock still allows

- Reading the quote and downloading the PDF
- Sending it again (re-sends are allowed; the lock state stays)
- Adding audit-log entries (the Activity tab grows)
- Personalising content overrides for THIS quote only (per-quote overrides don't count as "editing the quote")
- v1.9+: transitioning the lifecycle state (Sent → Viewed → Accepted etc.)
- v1.9+: stamping SharePoint sync-tracking fields

### How to tell a quote is locked

The proposal header shows an amber **Locked** badge next to the quote number, with version (e.g. "v1") and lock reason ("sent" / "manual" / "finalised"). Hover the badge for full tooltip: who locked it, when, and the lock reason.

### Manual lock

The "Lock manually" path isn't surfaced in v1.8 — locks happen automatically on send. Admin-only manual unlock is via the [Activity tab](#5-activity-tab--full-audit-trail) (see below).

---

## 4. Fork-on-Edit — make a new version of a locked quote

You can't edit a locked quote directly. To make changes, you fork it — creates a v2 that's an editable copy of the parent. The parent stays locked (for the audit trail) and your edits happen on the v2.

### To fork a locked quote

1. Open the locked quote
2. Click anywhere you'd normally edit (e.g. a feature toggle, a price field)
3. The **Create v2** confirmation popup appears: "This quote is locked. Create v2 from this to keep editing?"
4. Click **Create v2** → the fork helper copies every field from v1 EXCEPT lock-related fields, allocates a new doc ID with `version: 2` and `parentQuoteId: v1.id`, and redirects you to v2
5. v2 is unlocked, freshly editable. Customer-facing changes you make on v2 are entirely separate from v1

### What carries over to v2

- Every quote payload field (options, motor, trailer, dealer fit, pricing)
- Per-quote content overrides from v1 (your Personalise sheet edits)
- Assigned salesperson, customer details

### What resets on v2

- Lock state → unlocked
- Send history (`lastSentAt`, `sentCount`) → cleared
- Audit log → fresh (the parent's audit log stays on v1)
- v1.9+: lifecycle state → draft

### Tips

- **The version chain is durable** — `parentQuoteId` is a Firestore link that lets you walk the chain back. v1 has no `parentQuoteId`; v2 points at v1; v3 (if you fork v2) points at v2; etc.
- **You can fork a fork** — locking v2 and creating v3 is supported, but in practice operators usually start a new scenario (v1.9+) instead of versioning forever
- **Manual unlock exists for emergencies** — see Activity tab below

---

## 5. Activity Tab — full audit trail

Every lifecycle event on a quote is captured into a per-quote audit log subcollection. The Activity tab in the proposal header shows them all, newest-first.

### To open the Activity tab

1. Open any quote
2. Click the **Activity** button in the toolbar (chart icon)
3. A right-side sheet opens listing every audit event with: icon, label, time, who did it, plus event-specific summary text

### Event types captured

| Event | Fires when | Summary text |
|---|---|---|
| **Quote created** | New quote written for the first time | — |
| **Finalised** | Status flipped to 'proposal' or 'stock' | — |
| **Sent to customer** | Send Quote pipeline completes | Send id (truncated) |
| **Locked** | Auto-lock on first send OR manual lock | Reason (sent / manual / finalised) |
| **Unlocked** | Admin manual unlock from this same sheet | — |
| **Forked to new version** | Create v2 confirmed | Parent or child quote id (truncated) |
| **Content personalised** | Per-quote content override saved via Personalise sheet | Block type |
| **Discount changed** | Operator updated the discount field | `From $X → $Y` |

v1.9+ adds two more: **Status updated** (lifecycle transition) and **Scenario created**.

### Manual unlock (admin emergency override)

If you have `can_access_settings` permission on the org and the quote is currently locked, an **Unlock** button appears in the Activity sheet header. Clicking it:

1. Opens a confirmation popup explaining unlock is an emergency override (the standard path is to fork-on-edit, not unlock)
2. On confirm, writes `isLocked: false` + clears lock fields
3. Captures an `unlocked` audit event so the trail records who broke the seal

### Tips

- **The audit log is best-effort** — if Firestore write fails the audit entry is dropped (console-warn) but the underlying operation succeeds. The lock + send + override layers are the source of truth, not the audit log
- **No filter / search / export in v1.8** — deferred to v1.10+ if anyone asks
- **Audit log is per-quote** — there's no cross-quote "everything I did this week" feed today

---

## 6. Personalise Content — per-quote content overrides

You don't always want to ship the org-default content blocks unchanged for every customer. Sometimes a specific quote needs a custom "Why Us" message ("Tim — we agreed at the boat show…"), or a customer-specific T&Cs adjustment.

The **Personalise** button in the proposal toolbar opens a side sheet where you author per-quote overrides on any unlocked content block.

### To personalise a block for ONE quote

1. Open the quote in the proposal view
2. Click **Personalise** in the toolbar (sparkles icon)
3. Side sheet opens listing every content block applicable to this quote's document type (Quote vs Contract)
4. Each row shows the org-default content + a button to **Override for this quote**
5. Click Override → opens a rich-text editor pre-filled with the org-default content
6. Edit freely → Save
7. The override is now active for THIS quote only — Download / Send / Preview all render the overridden content; every other quote keeps the org default
8. The audit log captures `content-overridden` with the block type

### To clear an override (return to org default)

1. Re-open the Personalise sheet
2. The previously-overridden block has a **Reset to org default** button
3. Click → the per-quote override is deleted; render falls back to the org default again

### Limitations

- **Locked blocks can't be overridden** — if your admin has flagged a block as "Lock for quotes" (see next section), the Personalise sheet hides it from the picker. Org default always wins
- **Brand overrides still apply** — if the org has a brand-specific override (v1.7 feature), that's the baseline shown in the personalise editor, not the org default

---

## 7. Lock for quotes — admin-only content

Some content blocks should NEVER be edited per-quote — Terms & Conditions are the canonical case. Authoring control belongs to the org admin, not the salesperson. v1.8 adds a **Lock for quotes** toggle on each content block to enforce this at the resolver level.

### To lock a block

1. Open `/manage` → **Document Templates** tab
2. Pick the content block you want to lock (e.g. Terms & Conditions)
3. Click **Edit**
4. Toggle **Lock for quotes** on (top-right of the editor)
5. Save

### What this changes

- The resolver short-circuits the per-quote override layer for this block — even if a salesperson previously saved a Personalise override, it's ignored at render time
- The Personalise sheet hides this block from the picker so salespeople don't waste time authoring an override that won't fire

### When to use

- **T&Cs**: standard answer
- **Brand stories** that legal has signed off on
- **Finance & Insurance info** that has regulatory wording

Default is **off** — salespeople can personalise everything unless you explicitly lock it.

---

## 8. Content Block Import / Export

You can back up the org's entire set of content blocks (including brand overrides and locks) to JSON, or import a JSON file to seed a fresh org. Used for: testing, cross-org transfer, disaster recovery.

### To export

1. Open `/manage` → **Document Templates** tab
2. Click **Import / Export** (top-right, near the Block list)
3. Click **Export to JSON**
4. Browser downloads `content-blocks-{orgId}-{date}.json` with every block + brandOverrides + locks

### To import

1. Same surface → click **Import from JSON**
2. Pick the JSON file
3. Confirm in the popup (overwrites any blocks with matching keys; adds new ones)
4. Toast reports counts

### Tips

- **Export before any big change** — the rollback path is "import the previous export"
- **Cross-org transfer** is useful when you onboard a new dealership and want them to start with a known-good set of blocks; export from the template org, import into the new one
- **Backups don't include per-quote overrides** — those live in a separate subcollection. Export is org-default + brand-override only

---

## 9. Version-history polish

Every save on a content block creates a version snapshot. The version-history drawer (already in v1.7) gained quality-of-life improvements in v1.8.

### What's new

- **Compare with current** button on each version row — opens a diff against the current saved content so you can see what changed before restoring
- **Latest** badge on the most-recent version (avoids the "which one is current?" confusion)
- **Relative time** ("3h ago" / "yesterday") next to each version's saved-at timestamp

### To use

1. Open a content block editor → click **History** (clock icon)
2. Browser-side drawer lists every saved version
3. For any version, click **Compare with current** → side-by-side diff
4. Or click **Restore** → replaces the current content with that version's content (creates a new version snapshot so restore is itself reversible)

---

## How sending a quote works end-to-end

Pulling all the v1.8 pieces together — when you click Send Quote, this happens in order:

1. **Render** the PDF locally via the v1.5.0 single-source pipeline (same engine as Download)
2. **Write** the `sentEmails/{sendId}` record with frozen subject/body, PDF storage path, recipient list
3. **Enqueue** the email at `mail/{id}` — the Firebase Trigger Email extension picks it up and dispatches via SendGrid
4. **Denormalise** `quote.lastSentAt` + increment `quote.sentCount` on the quote doc
5. **Lock** the quote if this is the first send (sentCount went 0 → 1) via `lockQuote()` — captures the `locked` audit event with reason `'sent'`
6. **Audit** the `sent` event capturing the recipient + sentEmailId
7. Toast confirms success or surfaces the failure

In v1.9+ a step 8 fires (`transitionQuoteLifecycle('sent')` on first send) and step 9 fires (SharePoint sync if configured). The v1.8 baseline is steps 1–7.

If any step from 4 onward fails, the email still dispatched — the failure is logged but doesn't roll back the actual send. The audit trail captures what happened.

---

## What v1.8 did NOT ship (deferred to v1.9 / v1.10)

| Story | Why it's not in v1.8 |
|---|---|
| **1.1.2** Compatibility Rules + Highfield auto-seed | Needed to replace the working motor filter loop in `highfield-quote-flow.tsx` — rejected mid-cycle as too high-risk to introduce alongside the lifecycle changes. Foundation kept as backlog. **Shipped in v1.9.** |
| **1.8.3** `startsOnNewPage` UI checkbox | The v1.7 PDF architecture renders every content block on its own A4 page already — the schema field is dormant. Adding a no-op toggle would mislead users. Re-deferred from v1.9 to v1.10+ when there's a real multi-block-per-page case. |
| Email open / click tracking | SendGrid supports it but needs webhook receiver + Cloud Functions. v1.10+ |
| Reply-tracking (customer replies → quote thread) | v1.10+ |
| Cross-quote activity feed ("everything I did this week") | v1.10+ |
| Activity log filter / search / CSV export | v1.10+ |
| Per-event undo | v1.10+ |

---

## Pre-flight: things to verify after v1.8 deploys to prod

Quick checklist for your first session on the v1.8 build (if you're reading this backfill in a future onboarding):

- [ ] **Send Quote** button visible on every customer proposal (disabled until env flag is set + customer email exists)
- [ ] Open an old quote → Activity tab opens and lists the legacy events (created / finalised at minimum)
- [ ] Author a content block in `/manage` → save → reopen → History drawer shows the version + Latest badge
- [ ] Open Personalise sheet on a quote → confirm the block list renders + override + reset path works
- [ ] (When email flag is on) Send a test quote to your own inbox → confirm the PDF attaches + tokens replace correctly
- [ ] After first send, the quote shows the amber **Locked** badge in the header
