# HelmLogic — Release Notes v1.9.0

> Release Date: 2026-05-12
> Branch: `claude/app-overview-wKiZ1` → main
> Quote-lifecycle wrap-up release — Compat rules + Inline preview + Lifecycle state machine + Multiple scenarios + SharePoint storage

### Release Stats
- **10 commits** since v1.8.0 (kickoff `3a6a95a` → ship `5xxxxxx` + Phase D)
- **~25 files changed**, +~4100 / −350 lines net (mostly new SharePoint surface + lifecycle infra; very low churn on existing surfaces)
- TypeScript: zero new errors from v1.9 work (pre-existing `any` warnings in highfield-quote-flow, scripts, maritime-assistant-flow, sub-dealers unchanged)
- `npm run build`: clean

### Source of Requirements
v1.8 set v1.9 as the quote-lifecycle wrap-up release. Building on v1.8's Send + Lock + Audit + Personalisation, v1.9 closes the long-standing v1.7→v1.8 carry-over (1.1.2 Compatibility Rules), adds inline PDF preview (1.8.4), ships the full sales-journey state machine (1.4.1), introduces multiple-scenario siblings (1.1.3), and lands the SharePoint quote-storage integration (1.3.3) — the biggest single story in the cycle. The release stays under the 20-pt cap (17 pts planned, 1.8.3 dropped mid-Phase-A reclaimed 1 pt buffer).

**Punted to v1.10** during this cycle:
- **1.8.3 `startsOnNewPage` UI checkbox** — re-confirmed the v1.8 finding that the schema field is dormant under the v1.7 PDF architecture (every content block renders on its own A4 page in `proposal-pdf.tsx#renderBlockPages`). 1.8.4's inline-preview path didn't unblock it. The rendering refactor needed to make the flag actionable is ~5 pts of layout work, not the ~1 pt slice originally budgeted. Same call v1.8 made — shipping a no-op toggle was specifically rejected once and remains the right call. v1.10+ if there's a real multi-block-per-page layout case.

---

## Compatibility Rule Enforcement (1.1.2)

Two-feature compatibility checks at quote-build time, sourced from per-module rules in Firestore. When a salesperson configures a quote with two features the boat manufacturer marks incompatible (e.g. two competing sun-shades, or a feature that requires a console you didn't pick), the picker surfaces the conflict before the quote lands.

### Schema
- `modules/{moduleId}/compatibilityRules/{ruleId}` — `{ kind: 'forbids' | 'requires', featureA: string, featureB: string, reason: string, isActive: boolean }`
- Engineering authors rules direct to Firestore for v1.9 (admin UI deferred to v1.10+ per the v1.6.2 schema decision)
- 3 Highfield example rules auto-seeded as `isActive: false` templates via a one-shot button — operator flips `isActive` after replacing placeholder feature IDs

### What ships
- `src/lib/compatibility-rules.ts` — schema types + resolver helpers
- One-shot "Seed Highfield Compat" button on the Backlog header (Commit 2 added it, Commit 2b removed it — clean lifecycle per CONVENTIONS.md)
- 🚨 `firestore.rules` — `modules/{moduleId}/compatibilityRules/{ruleId}` path

---

## Quote Preview Sheet (1.8.4)

A Preview button in the proposal toolbar opens a right-side Sheet rendering the same customer PDF the Download button produces, inline in an iframe with the browser's native PDF chrome (zoom, page nav, search). Reuses `renderQuotePdf()` from v1.8's 1.5.0 single-source pipeline, so Preview matches Download byte-for-byte and the in-memory blob is reused by the sheet's own Download button (no second render).

### What ships
- `src/components/quote-preview-sheet.tsx` — Sheet with iframe rendering, ObjectURL revoked on close to prevent blob leaks
- Preview button on `proposal-view.tsx` between Send Quote and Download PDF
- `content-block-detail.tsx` surface DROPPED mid-build: v1.7 story 1.8.7 already ships an inline `<ContentBlocksPdfPreview>` + focus-mode fullscreen on that surface. A second Preview button there would duplicate v1.7 with no UX gain.

---

## Quote Lifecycle State Machine (1.4.1)

A full sales-journey state machine ships orthogonal to v1.8's lock layer. Quotes track `draft → sent → viewed → accepted / rejected / lost / expired` with a manual transition picker in the proposal header. The state is captured in the Activity tab with from→to summaries; locked quotes can still transition (the sales journey continues after the auto-lock fires on first send).

### Schema
New field on `users/{ownerUid}/quotes/{quoteId}`:
- `lifecycleState?: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'lost' | 'expired'`
- `lifecycleStateAt?: Timestamp`
- `lifecycleStateByUid?: string`
- `lifecycleStateByName?: string`

Deliberately separate from the existing v1.5 `status` field (`'proposal' | 'stock'`) which is the quote TYPE — overloading status would force a migration of every existing stock quote.

### Resolver
- `getLifecycleState(quote)` — defaults absent field to `'draft'` for legacy quotes
- `transitionQuoteLifecycle()` — idempotent (no-op if already in target state); writes audit entry on every transition

### What ships
- `src/lib/quote-lifecycle.ts` — type + helpers + transition helper (mirrors `quote-lock.ts` pattern)
- `src/lib/quote-audit-log.ts` — `'lifecycle-transitioned'` event type + `fromLifecycle` / `toLifecycle` metadata
- `email-send.ts` — auto-transition to `'sent'` after first send (gated on `previousSentCount === 0` so re-sends never clobber later operator transitions like Sent → Accepted)
- `proposal-view.tsx` — status badge becomes a Popover state-picker for proposal-type quotes (stock keeps the plain "stock" badge); Activity row meta + renderSummary extended to show `draft → sent` style
- 🚨 `firestore.rules` — `onlyLifecycleFieldsChanged()` helper allows locked quotes to receive lifecycle-only writes (lock gates content edits, not sales journey)

### Out of scope for v1.9 (deferred to v1.10+)
- ❌ Auto-transition via email open-tracking (waiting on email-infra stakeholder decision, same gate as 1.3.2 punt)
- ❌ Time-based expiry cron
- ❌ State-machine graph enforcement (v1.9 trusts the operator + audit log; mis-clicks are correctable by re-transitioning)

---

## Multiple Quote Scenarios (1.1.3)

Salespeople can now offer the same customer multiple framings of the same boat ("Trade-in option", "Cash deal", "Finance bundle") as a single quote family. A "Scenario" button in the proposal toolbar opens a single-input dialog (5 quick-pick suggested labels); creating spawns a sibling quote with its own quoteNumber, fresh draft state, and `parentQuoteId` pointing at the family root.

### Schema
New field on the scenario quote doc:
- `scenarioLabel?: string` — human-readable, internal-only

Reuses existing `parentQuoteId` from v1.8 fork machinery. Scenarios reparent to the ROOT of the family (parent.parentQuoteId ?? parent.id) so a scenario-of-a-scenario still siblings under the root, not nested in chains.

### What ships
- `src/lib/quote-scenarios.ts` — `createQuoteScenario()` helper + `useSiblingScenarios()` live hook returning `[root, ...scenarios]` for the current quote's family
- `src/components/create-scenario-dialog.tsx` — single-input dialog with 5 quick-pick suggested labels, Enter-key submits
- "Scenario" button in proposal toolbar (hidden for stock quotes)
- scenarioLabel chip rendered next to the lifecycle picker when set
- Scenarios sub-section at the top of the Activity Sheet — root + every scenario as click-to-navigate rows with lifecycle pills and lock indicators (hidden when family has only one quote)
- `'scenario-created'` audit event with scenarioLabel + siblingQuoteId metadata; Activity row + summary wired
- Each scenario gets a fresh quoteNumber so the `/proposals/[quoteNumber]` route resolves cleanly per sibling

---

## SharePoint Quote Storage (1.3.3)

The biggest single story this cycle (originally 5 pts, expanded mid-build to ~7 pts). Mirrors customer-quote PDFs into a SharePoint site folder tree that matches HelmLogic's Firestore hierarchy 1:1. HelmLogic stays the source of truth; the SharePoint copy is a read-only artefact for non-HL stakeholders (managers, accountants, dealer-network ops).

### Folder mirror (4 levels deep)

```
{sharePointConfig.folderPath root}/
  HelmLogic — {Organisation Name}/             = organisations/{orgId}
    {Salesperson Display Name}/                = users/{createdByUid}
      {Customer Name} — {Root Quote#}/         = quote family root
        Original/                              = root quote
          Quote.pdf
        {Scenario Label}/                      = v1.1.3 sibling
          Quote.pdf
        v{N}/                                  = v1.8 fork-on-edit
          Quote.pdf
```

Forbidden characters (`\ / : * ? " < > |`) replaced with `-`; trailing dots/spaces trimmed; empty segments fall back to placeholders.

### Sync triggers (5 events)
Expanded mid-build from the initial "Finalize only" call to the full set, per the user's "do it all" directive:
1. **Finalize** — initial PDF on quote creation
2. **Send** — every successful send (runs after auto-lock + lifecycle-Sent in `email-send.ts`); the PDF that went to the customer is what lands in SharePoint
3. **Scenario create** — new branch in the folder tree on every Create Scenario
4. **Fork-on-edit** — v{N} subfolder on every v1.8 fork-on-edit
5. **Terminal lifecycle** — Accepted / Rejected / Lost / Expired transitions re-sync the latest PDF

All fire-and-forget + best-effort: failures log a `console.warn` and resolve; the parent HL operation is never blocked.

### Architecture
- **One Azure app** ("HelmLogic SharePoint Sync"), multi-tenant. Each org admin grants this app access to their SharePoint site via the standard app-only consent flow
- **Secret** lives once in Firebase App Hosting backend env (`SHAREPOINT_CLIENT_SECRET`) — never in Firestore, never in the client bundle, never in `NEXT_PUBLIC_*`
- **Per-org config** at `organisations/{orgId}/sharePointConfig/default` carries the public identifiers (`tenantId`, `clientId`, `siteId`, `folderPath`) + a per-org enabled toggle
- **PDF render** stays client-side (existing `renderQuotePdf()` flow); API route is purely the SharePoint proxy — no Firebase Admin SDK lift
- **Sync orchestrator** is self-contained from just `(firestore, ownerUid, quoteId)` so every call-site can fire-and-forget

### Env-flag gating
`NEXT_PUBLIC_SHAREPOINT_ENABLED` controls whether sync hooks fire at all. Off by default — v1.9 ships to prod safely even before Azure setup is complete. Same pattern as v1.8's email flag (`NEXT_PUBLIC_EMAIL_SEND_ENABLED`).

### What ships
- `src/lib/sharepoint-path.ts` — pure 4-level path builder with sanitization
- `src/lib/sharepoint-config.ts` — types + `useSharePointConfig()` hook + `isSharePointEnabled()` / `isConfigUsable()` helpers
- `src/lib/sharepoint-sync.ts` — client orchestrator
- `src/app/api/sharepoint-sync/route.ts` — Next.js Node API route: OAuth client-credentials → resolve drive → ensure folder hierarchy → PUT file with `conflictBehavior=replace`
- `src/components/sharepoint-config-editor.tsx` — `/manage` → Integrations tab form
- `manage-organisation-page.tsx` — new Integrations tab hosting the editor (grid-cols bumped 5→6 / 6→7 with subDealers)
- 5 sync hooks wired (fire-and-forget) at finalize-quote-dialog, email-send, create-scenario-dialog, proposal-view fork-confirm, proposal-view terminal-lifecycle
- New quote-doc fields: `sharePointSyncedAt`, `sharePointPath`, `sharePointWebUrl`
- 🚨 `firestore.rules` — `onlySharePointFieldsChanged()` helper (locked quotes accept sync-tracking writes); `sharePointConfig` subcollection rule under `organisations/{orgId}`
- `tasks/ADMIN_TASK_sharepoint-setup.md` — full Azure app registration walkthrough mirroring v1.8's email setup doc

### Stakeholder pause — Azure infrastructure
SharePoint sync code ships dormant until `NEXT_PUBLIC_SHAREPOINT_ENABLED=true` AND `SHAREPOINT_CLIENT_SECRET` is set in Firebase App Hosting AND at least one org has a populated `sharePointConfig` doc. v1.9 deploy is safe to roll regardless — same pattern as v1.8's email flag.

### Out of scope for v1.9 (deferred to v1.10+)
- ❌ API-route authentication — currently trusts the calling client. Risk is low (tenant IDs + client IDs are public; Graph rejects requests without the correct server-side secret). v1.10 firebase-admin `verifyIdToken()` adds the explicit gate.
- ❌ Per-org Azure apps (every org consumes the same multi-tenant HelmLogic app today)
- ❌ Two-way sync (SharePoint edits don't flow back to HL)
- ❌ Retroactive backfill of pre-v1.9 quotes

---

## Process learnings codified

### Always paste the FULL firestore.rules file (CLAUDE.md)
Mid-cycle user correction: when surfacing a rules change for the operator to publish to Firebase Console, the diff form is wrong. The console flow is "select all → paste → publish", so the paste must be the complete current ruleset; otherwise every other rule gets wiped on publish. Captured as a Known Lesson under `CLAUDE.md` so this defaults correctly for every future release.

### Roadmap-truly-reflective (one-shot story refresh pattern)
When mid-build scope expansion happens (v1.9 SharePoint went from "Finalize only" trigger to all 5 events), the in-app `/feature-tracking` story doc needs its acceptance criteria + description updated so the roadmap matches what shipped — not what was originally scoped. Pattern: ship a one-shot seed button on the Backlog header in the same commit as the scope expansion, user clicks it, follow-up commit removes the button + script per CONVENTIONS.md one-shot lifecycle. Used twice this cycle (1.1.2 Highfield compat seed + 1.3.3 SharePoint story refresh) with identical Commit N / Commit Nb pairing.

### Pre-build calibration questions before commit
v1.8.4 (Preview) had a hidden duplication risk — v1.7 story 1.8.7 already shipped a content-block PDF preview with focus mode. Caught BEFORE writing code by surveying the existing surface and asking the user to confirm scope (drop the content-block-detail surface, only add the proposal-view button). Same pattern caught 1.8.3's dormant-schema issue. The lesson: when a build-plan story leans on a prior release's foundation, verify the foundation actually exists and does what the new story assumes BEFORE writing code, not after.

---

## Files Changed
```
src/lib/
  compatibility-rules.ts                 (new — 1.1.2)
  quote-lifecycle.ts                     (new — 1.4.1)
  quote-scenarios.ts                     (new — 1.1.3)
  sharepoint-path.ts                     (new — 1.3.3)
  sharepoint-config.ts                   (new — 1.3.3)
  sharepoint-sync.ts                     (new — 1.3.3)
  quote-audit-log.ts                     (extended — 'lifecycle-transitioned', 'scenario-created' event types + metadata)
  email-send.ts                          (extended — auto-transition to 'sent' + SharePoint sync hook)
  release-schedule.ts                    (v1.9 shipped flag flipped)

src/components/
  quote-preview-sheet.tsx                (new — 1.8.4)
  create-scenario-dialog.tsx             (new — 1.1.3)
  sharepoint-config-editor.tsx           (new — 1.3.3 /manage UI)
  proposal-view.tsx                      (Preview button, lifecycle Popover, scenarioLabel chip, Scenarios sub-section in Activity Sheet, fork sync hook, terminal-lifecycle sync hook, Activity row meta for 2 new event types)
  manage-organisation-page.tsx           (Integrations tab added — grid-cols bumped 5→6 / 6→7)
  finalize-quote-dialog.tsx              (SharePoint sync hook on finalize)
  backlog-view.tsx                       (two one-shot seed buttons added + removed in same cycle — 1.1.2 + 1.3.3)

src/app/api/
  sharepoint-sync/route.ts               (new — Next.js Node API route, OAuth + Graph upload)

firestore.rules                          (onlyLifecycleFieldsChanged() + onlySharePointFieldsChanged() helpers, compatibilityRules + sharePointConfig subcollection rules, OR'd allowances on quote update rule)

CLAUDE.md                                (release-state table flipped + new lesson: "always paste the FULL firestore.rules file")

tasks/
  ADMIN_TASK_sharepoint-setup.md         (new — Azure walkthrough)
  RELEASE_NOTES_v1.9.0.md                (this file)
  v1.9-build-plan.md                     (new — drafted at kickoff, evolved through the cycle; final state captures every retarget + cleanup)
```
