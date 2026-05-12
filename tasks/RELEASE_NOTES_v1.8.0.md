# HelmLogic — Release Notes v1.8.0

> Release Date: 2026-05-11
> Branch: `claude/app-overview-wKiZ1` → main
> Quote Lifecycle release — Send + Lock + Audit + Personalisation + dependency hygiene

### Release Stats
- **22 commits** since v1.7.0 (kickoff `a90319c` → ship `cf8a1f5`+ Phase D)
- **~20 files changed**, +~4500 / −160 lines net (most of it new authoring + lifecycle infra; very low churn on existing surfaces)
- TypeScript: zero new errors from v1.8 work (pre-existing `any` warnings in highfield-quote-flow, model-editors, etc. unchanged)
- `npm run build`: clean

### Source of Requirements
v1.6.2 set v1.8 as the Quote Lifecycle release. Building on v1.7's Customer-PDF authoring foundation, v1.8 adds the runtime layer: salespeople can personalise org-authored content per-quote, send the quote to the customer (when email infra lands), lock-on-send, fork-on-edit for v2+, and a full per-quote audit trail. The release also lands the dependency-hygiene tooling from the v1.6.2 mid-PR audit (6.4.x) and a small render-pipeline refactor (1.5.0) that single-sources every PDF call-site.

**Punted to v1.9** during this cycle:
- **1.1.2 Compatibility Rules + Highfield auto-seed** (3 pts) — needs to replace the working motor filter loop in `highfield-quote-flow.tsx`. Rejected mid-cycle as too high-risk to introduce alongside the lifecycle changes; foundation kept as backlog with the existing motor filter untouched.
- **1.8.3 `startsOnNewPage` UI checkbox** — the v1.7 PDF architecture (`proposal-pdf.tsx#renderBlockPages`) renders every content block on its own A4 page already, so the schema field is dormant. Adding a toggle that does nothing would mislead users; the actual page-break wiring needs an inline-render path that's out of v1.8 scope. Field stays as a future-proofing slot.

---

## Quote Lock + Fork-on-Edit (1.3.1)

Quotes that have been finalised, sent to a customer, or manually locked become read-only at the rules layer + UX layer. Edits on a locked quote happen by forking to a new version — `quoteId` + `parentQuoteId` + `version` are denormalised on the doc so the Activity tab can render the lineage.

### What ships
- `src/lib/quote-lock.ts` — `lockQuote()`, `unlockQuote()`, `forkLockedQuote()` helpers
- `firestore.rules` — `onlyLockFieldsChanged()` whitelist guard so power-users with browser dev tools can't bypass the lock
- Lock badge in proposal-view header with reason + version chip
- Duplicate button hidden when locked; **Create v2** button replaces it semantically
- Fork-on-edit popup (per CONVENTIONS.md popups-for-confirmations rule) → writes the v2 doc + parent linkage + audit-log entry
- Manual unlock from the Activity tab (admin-only, gated by `can_access_settings`) for emergency edits

### Auto-lock triggers
- Finalize Quote (existing flow) → auto-locks with `lockedReason: 'finalised'`
- First Send Quote action (1.2.4 below) → auto-locks with `lockedReason: 'sent'`

---

## Quote Audit Log (1.4.1)

Every lifecycle event for a quote is captured in `users/{ownerUid}/quotes/{quoteId}/auditLog/{eventId}`. Surface in proposal-view via the new **Activity** tab.

### Schema
```
users/{ownerUid}/quotes/{quoteId}/auditLog/{eventId}
  eventType: 'created' | 'finalised' | 'sent' | 'locked' | 'unlocked'
           | 'version-forked' | 'content-overridden' | 'discount-changed'
  at: serverTimestamp()
  byUid, byName: actor identity
  metadata: optional {
    blockType, parentQuoteId, childQuoteId, sentEmailId,
    lockReason, note
  }
```

### What ships
- `src/lib/quote-audit-log.ts` — `logAuditEvent()` writer + `useQuoteAuditLog()` subscription hook
- 8 event types, all best-effort (write failure logs a console warning, never throws)
- Activity tab in proposal-view (Sheet) — sticky badge with event count
- Wired into 3 existing mutation sites (1.4.1.b): create, finalize, discount-change
- New event-types fired from 1.2.3.c (content-overridden), 1.2.4.c (sent), 1.3.1.a/c (locked / unlocked / version-forked)

---

## Send Quote Pipeline (1.2.4)

Send Quote button on proposal-view → dialog with template picker + preview → renders the PDF + uploads to Storage + writes a `mail/{id}` doc that the Trigger Email extension picks up + audit-logs the send + auto-locks on first send.

### What ships
- `src/lib/email-send.ts` — `sendQuoteEmail()` orchestrator + merge-field schema + `isEmailSendEnabled()` env-flag gate
- `src/components/email-template-manager.tsx` — TipTap-based template authoring under `/manage` → Document Templates → Email tab
- **Quote / Contract email sub-types** (5351cf1) — inner Tabs lets the same authoring surface drive both `send-quote` and `send-contract` template types
- `src/components/send-quote-dialog.tsx` — recipient + template + subject + body preview + frozen-content snapshot
- Per-org email-template subcollection: `organisations/{orgId}/emailTemplates/{templateId}`
- Per-quote sent-email audit: `users/{uid}/quotes/{qid}/sentEmails/{sendId}` capturing recipient, frozen subject/body, PDF Storage path, status, FK into `mail/{id}`
- `firestore.rules` — `emailTemplates` + `sentEmails` rules

### Stakeholder pause — email infrastructure
Sender domain + provider (SendGrid) + cost decisions are **not yet approved**. The pipeline is built end-to-end; the Send Quote button is gated by `NEXT_PUBLIC_EMAIL_SEND_ENABLED` (default `false`):
- Button visible but **disabled** with tooltip "Email sending is awaiting infrastructure setup"
- Templates can still be authored in `/manage`
- When the env flag flips to `true`, no code change is needed — `mail/{id}` writes start flowing through Trigger Email
- See `tasks/ADMIN_TASK_email-trigger-setup.md` for the SendGrid / Trigger Email setup walkthrough

---

## Controlled Personalisation (1.2.3)

Salespeople can override the body / sub-header of any Quote Content Block on a single quote, without touching the org default. Admins can lock individual blocks to prevent per-quote overrides.

### Schema
```
organisations/{orgId}/contentBlocks/{blockId}
  isLockedForQuotes?: boolean   ← NEW (default false / missing = unlocked)

users/{ownerUid}/quotes/{quoteId}/contentOverrides/{blockType}   ← NEW collection
  html?: string | null
  subHeader?: string | null
  overriddenAt, overriddenByUid, overriddenByName
```

### Resolver precedence (highest → lowest)
1. Per-quote override (when `quoteOverrideCtx` provided AND block is unlocked)
2. Brand override (`brandOverrides/{vendorId}`)
3. Org default (`html` on parent block doc)

Locked blocks (`isLockedForQuotes === true`) short-circuit the per-quote layer entirely — admin content always wins.

### What ships
- `src/lib/content-blocks.ts` — `ContentOverride` type + `resolveContentBlocksForQuote(..., quoteOverrideCtx)` + matching sub-header resolver
- Admin lock toggle in Content Block Manager (Switch with amber chip + Info-tab "Personalisation" line)
- `src/components/personalise-content-sheet.tsx` — two-pane sheet (section picker + per-block TipTap editor + Reset to default + audit-logged save/reset)
- Personalise button in proposal-view header (hidden when quote locked)
- `src/lib/render-quote-pdf.ts` threads `{ ownerUid: quote.createdByUid, quoteId: quote.id }` into both resolvers so overrides surface on the customer PDF + Send Quote PDF + finalize snapshot
- `firestore.rules` — `contentOverrides/{blockType}` subcollection

---

## Version-history polish (1.8.3)

Content Block Manager's history drawer pays off the v1.7 foundation:
- **Compare with current** toggle — when a selected version differs from live, swaps the single preview for a side-by-side ("Current (live)" left vs "Selected version" right) so authors see what would change before clicking Restore
- **Latest** badge on the top row of the version list
- Relative timestamps ("2 days ago") under absolute dates

---

## Content Block Import / Export (1.8.8)

Toolbar above the Content Block Manager grid:
- **Export JSON** — serialises every org-default content block to one JSON file with a `schemaVersion` sentinel (`helmlogic-content-blocks-v1`)
- **Import JSON** — file picker → parse → AlertDialog confirm popup with full block list → upsert by `blockType` natural key (per the v1.4 import-hygiene rule, never clear-and-replace)
- Reports `N updated · M created · K skipped (unknown blockType)`

Use cases: dealer-group HQ → sub-orgs template seeding, snapshot/restore before a big rewrite, dev → prod content promotion.

**Out of scope (v1.9 backlog):** brand overrides (vendor-tied), version history (re-imports create fresh versions instead), per-quote contentOverrides (quote-tied).

---

## PDF Render Pipeline Refactor (1.5.0)

`src/lib/render-quote-pdf.ts` now single-sources every PDF render path:
- proposal-view "Download PDF"
- finalize-quote-dialog snapshot
- send-quote-dialog (new in 1.2.4)

Avoids the v1.4 trailer-snapshot bug class (pick-time pipelines diverge silently) — three call-sites can no longer drift. Pipeline stages: resolve content blocks → resolve sub-headers → preload images to data URLs (CORS bypass via `/api/image-proxy`) → swap URLs in HTML + on motor/trailer/cover/logo fields → render `<ProposalPDFDocument>`.

Server-side render (Cloud Function) deferred to v1.9 for system-initiated emails.

---

## Dependency Hygiene Tooling (6.4.x)

Direct response to the v1.6.2 mid-PR audit lesson. Cross-story dependencies are now machine-readable, not buried in prose.

### What ships
- **6.4.1** `dependsOn: string[]` schema on every feature + `src/lib/dependency-validation.ts` (`validateRetarget()`, `resolveDep()`, `colourForDep()`) + UI validation in retarget popup that blocks targeting `vX` when a dependency lives in `vX+`
- **6.4.2** `scripts/validate-features.ts` (npm `validate:plan`) — pre-merge regex-based validator that fails CI when a story acceptance text references a story-id outside its release window without a `dependsOn` link
- **6.4.3** Doc-only convention codified in `tasks/CONVENTIONS.md`: every hard dep starts with `DEPENDS ON x.y.z`; soft references use `RELATED:` or `See also:`

---

## CONVENTIONS.md (process)

New `tasks/CONVENTIONS.md` codifies the cross-cutting standards stories should reference rather than re-spell:
- Popups for confirmations (AlertDialog)
- Image-preload pattern (data URLs for cross-origin)
- Server-side fetch via `/api/image-proxy` for CORS-blocked images
- One-shot seed lifecycle (button + module removed in same dev cycle)
- `DEPENDS ON x.y.z` cross-story-dep prefix
- Living-stories pattern (update AC mid-build, not end-of-cycle batch)
- Don't expand release scope mid-cycle
- Release notes ship in the same PR as the release

---

## Files Changed
```
src/lib/
  content-blocks.ts                    (extended — isLockedForQuotes, ContentOverride, resolver ctx)
  quote-lock.ts                        (new)
  quote-audit-log.ts                   (new)
  email-send.ts                        (new)
  render-quote-pdf.ts                  (new — single-source PDF pipeline)
  dependency-validation.ts             (new — 6.4.1)
  release-schedule.ts                  (v1.8 shipped flag flipped)

src/components/
  proposal-view.tsx                    (lock badge, Activity tab, Personalise button, fork popup, unlock popup, Send Quote button, audit subscription)
  content-block-detail.tsx             (admin lock toggle, version-history currentHtml prop)
  content-block-manager.tsx            (mounts ContentBlockImportExport)
  content-block-version-history-drawer.tsx (Compare with current + Latest badge + relative time)
  content-block-import-export.tsx      (new — 1.8.8)
  personalise-content-sheet.tsx        (new — 1.2.3.c)
  email-template-manager.tsx           (new + Quote/Contract sub-tabs)
  send-quote-dialog.tsx                (new — 1.2.4.c)
  manage-organisation-page.tsx         (Email tab, Document Templates surface)

scripts/
  validate-features.ts                 (new — 6.4.2)

firestore.rules                        (auditLog, sentEmails, emailTemplates, contentOverrides, onlyLockFieldsChanged() guard, lock-aware update rule)

tasks/
  CONVENTIONS.md                       (new)
  v1.8-build-plan.md                   (new)
  ADMIN_TASK_email-trigger-setup.md    (new — SendGrid walkthrough)
  RELEASE_NOTES_v1.8.0.md              (new — this file)
```
