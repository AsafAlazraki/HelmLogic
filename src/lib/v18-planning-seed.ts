/**
 * v1.8 planning seed (planning-only).
 *
 * One-shot button on the Backlog that primes Firestore for the v1.8
 * build. Runs four jobs (idempotent everywhere):
 *
 *   1. CREATE 2 new stories that didn't exist in the v1.6.2 restructure:
 *      - 1.5.0 Extract render-quote-pdf.ts (3 pts, infra refactor)
 *      - 1.4.1 Quote auditLog subcollection + Activity tab (2 pts)
 *
 *   2. CLOBBER acceptanceCriteria + points + type on the 9 existing v1.8
 *      stories with the expanded AC from the v1.8 build plan (Step 2).
 *      Replaces the v1.6.2 thin AC with the proactive scope-locked AC.
 *
 *   3. POPULATE the new dependsOn[] field per the build-order graph.
 *
 *   4. RETARGET 1.1.3 Multiple Quote Scenarios v1.8 → v1.9 (deferred per
 *      Step 1 ruling).
 *
 * Per CONVENTIONS.md "one-shot seed lifecycle": this file + the button
 * on backlog-view.tsx ship together, the user clicks once, both file +
 * button get removed in the next commit before v1.8 build kicks off.
 *
 * NOT done by this seed:
 *   - Status changes (every v1.8 story stays at its current status — they're
 *     all unbuilt, the v1.8 finalize seed at end-of-cycle marks them shipped)
 *   - Highfield compatibility-rule data seed (lives in a separate seed wired
 *     to story 1.1.2 and runs at v1.8 ship time)
 *   - RELEASE_WINDOWS['v1.8'].shipped flag (flips at dev → main merge, not now)
 *   - Any v1.7 story modifications (locked emerald via finalize seed)
 */

import {
    addDoc,
    collection,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';

interface NewFeature {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    type: 'feature' | 'task' | 'improvement';
    priority: 'critical' | 'high' | 'medium' | 'low' | 'nice-to-have';
    points: number;
    targetRelease: 'v1.8';
    dependsOn: string[];
}

interface StoryUpdate {
    /** Match by title prefix (e.g. "6.4.3 —"). Whitespace tolerant. */
    titlePrefix: string;
    acceptanceCriteria: string[];
    points?: number;
    dependsOn: string[];
    /** When set, ALSO retargets the story to this release. */
    targetRelease?: 'v1.8';
}

interface Retarget {
    titlePrefix: string;
    to: 'v1.9';
}

/* ──────────────────────────────────────────────────────────────────
 * NEW STORIES — created in Firestore by this seed.
 * ────────────────────────────────────────────────────────────────── */

const NEW_FEATURES: NewFeature[] = [
    {
        title: '1.5.0 — Extract render-quote-pdf.ts PDF render pipeline',
        description: 'Extract the duplicated PDF render pipeline (image preload + content-block resolver + sub-header resolver + brand-override resolver + ProposalPDFDocument render) from proposal-view.tsx and finalize-quote-dialog.tsx into a single src/lib/render-quote-pdf.ts. Hard prerequisite for 1.2.4 Send Quote — without this refactor we maintain three drifting pipelines.',
        acceptanceCriteria: [
            'New file src/lib/render-quote-pdf.ts exports renderQuotePdf({firestore, storage, quote, organisation, financials, documentType?}) returning {blob: Blob}.',
            'Internally dynamic-imports @react-pdf/renderer + proposal-pdf + content-blocks + image-preload so it stays code-split-friendly.',
            'proposal-view.tsx download path collapses from 80+ lines to a 2-3 line invocation.',
            'finalize-quote-dialog.tsx finalize-snapshot path collapses similarly.',
            'Smoke-test: render against the v1.7 sample-quote-fixture, assert blob > 0 bytes.',
            'No regression on existing finalize / download flows — manual smoke + diff PDF byte counts to a v1.7 baseline.',
            'OUT OF SCOPE: server-side rendering migration (deferred to v1.9), caching the rendered blob (every call re-renders).',
            'DEPENDS ON: nothing.',
            'Convention: respects every line in tasks/CONVENTIONS.md.',
        ],
        type: 'task',
        priority: 'high',
        points: 3,
        targetRelease: 'v1.8',
        dependsOn: [],
    },
    {
        title: '1.4.1 — Quote audit log subcollection + Activity tab',
        description: 'Adds a users/{ownerUid}/quotes/{quoteId}/auditLog/{eventId} subcollection capturing every lifecycle event (created, finalised, sent, locked, unlocked, version-forked, content-overridden, discount-changed) and renders an Activity tab in proposal-view.tsx. Glue layer that 1.3.1 (lock), 1.2.4 (send), and 1.2.3 (personalisation) all write into.',
        acceptanceCriteria: [
            'New subcollection users/{ownerUid}/quotes/{quoteId}/auditLog/{eventId} with fields: eventType, at (Timestamp), byUid, byName, metadata? (shape varies by eventType).',
            'eventType enum: created | finalised | sent | locked | unlocked | version-forked | content-overridden | discount-changed.',
            'metadata.fromValue + metadata.toValue captured on discount-changed.',
            'metadata.blockType captured on content-overridden.',
            'metadata.parentQuoteId captured on version-forked.',
            'metadata.sentEmailId captured on sent.',
            'metadata.lockReason captured on locked.',
            'New helper src/lib/quote-audit-log.ts exports logAuditEvent(firestore, ownerUid, quoteId, event) and useQuoteAuditLog(quoteId) hook.',
            'Existing call-sites that mutate the quote add logAuditEvent calls: quote-flow finalize → created/finalised, finalize-quote-dialog → finalised, proposal-view discount sheet → discount-changed, 1.2.4 send → sent, 1.3.1 lock → locked/unlocked, 1.2.3 override save → content-overridden, 1.3.1 fork → version-forked.',
            'New "Activity" tab in proposal-view.tsx next to existing Audit / Discount drawers.',
            'Activity tab body: chronological list (newest first), each row = icon + actor + timestamp + summary line.',
            'Tab badge shows total event count.',
            'Empty state: "No activity yet — this quote was created before the v1.8 audit log." for legacy quotes.',
            'Firestore rules: read-allowed for the quote owner; write-allowed for isSignedIn() (matches the rest of users/{uid}/quotes/{qid}/* paths).',
            '🚨 firestore.rules CHANGE — DEPLOY RULES banner required when this story ships.',
            'OUT OF SCOPE: filter / search in Activity tab (v1.9), CSV/PDF export (v1.9), cross-quote activity feed (v1.9), per-event undo (deferred), audit-trail server-side enforcement (v1.9).',
            'DEPENDS ON: nothing.',
            'Convention: respects every line in tasks/CONVENTIONS.md (popup-for-confirmations on any destructive action like delete-event).',
        ],
        type: 'feature',
        priority: 'high',
        points: 2,
        targetRelease: 'v1.8',
        dependsOn: [],
    },
];

/* ──────────────────────────────────────────────────────────────────
 * STORY UPDATES — clobber AC + set points + dependsOn + targetRelease
 * on existing v1.8 stories.
 * ────────────────────────────────────────────────────────────────── */

const STORY_UPDATES: StoryUpdate[] = [
    {
        titlePrefix: '6.4.3',
        acceptanceCriteria: [
            'Create tasks/CONVENTIONS.md as the new home for cross-cutting standards (popup-for-confirmations, image-preload pattern, one-shot-seed lifecycle, etc.).',
            'Add a "Cross-story dependency convention" section to CONVENTIONS.md spelling out: hard deps prefixed exactly "DEPENDS ON 1.8.1" (regex-matched canonical form, no comma, no parentheses), soft references prefixed "RELATED:" or "See also:". Examples for each.',
            'Add a 1-line callout in CLAUDE.md Known Lessons pointing at CONVENTIONS.md for the convention.',
            'Verify and update tasks/RELEASE_PROCESS.md to canonical form (already mentions this convention, harmonise wording).',
            'v1.8+ planning seeds use the canonical prefix for any cross-story refs.',
            'OUT OF SCOPE: retro-rewriting existing 95 stories\' acceptance lines wholesale. Updates only happen when a story is touched for other reasons.',
            'OUT OF SCOPE: prefix variants (Why / Because / DEPS:) — strict canonical form only.',
            'DEPENDS ON: nothing — this is the foundation 6.4.1 + 6.4.2 build on.',
        ],
        points: 0,
        dependsOn: [],
        targetRelease: 'v1.8',
    },
    {
        titlePrefix: '6.4.1',
        acceptanceCriteria: [
            'FeatureDoc interface gains dependsOn?: string[] (canonical numbers like ["1.8.1", "1.2.1"]) and dependsOnSoft?: string[] for RELATED: refs.',
            'Existing 95 stories with dependsOn === undefined treated as "no deps" — never injected as [] on read.',
            'Feature detail sheet: new "Depends On" row beneath acceptanceCriteria. Shows chips per dep, each resolving the matching feature by title.startsWith("X.Y.Z —").',
            'Chip colour-coding: green = same release or earlier, amber = later release, red = missing / unscheduled / soft-deleted.',
            'Soft-deleted features filtered from the lookup (deletedAt != null skipped).',
            'Add/remove deps via multi-select autocomplete. Auto-validates the format on input via regex /^\\d+\\.\\d+\\.\\d+$/.',
            'Retarget validation: when user retargets a story (drag on Roadmap, or Edit dialog), call validateRetarget(feature, dependsOn, newRelease) BEFORE the Firestore write.',
            'If any dep is in a later release than the new target → POPUP AlertDialog: "This story depends on 1.8.1 which is in v1.8. Moving to v1.7 will break dependency order. Override anyway?" with Cancel / Override buttons.',
            'Override path logs to console + adds dependencyOverrides[] audit field on the feature doc — never silent.',
            'New helper src/lib/dependency-validation.ts exports validateRetarget(), resolveDep(), colourForDep().',
            'OUT OF SCOPE: cycle detection (v1.9), auto-parsing DEPENDS ON x.y.z from acceptanceCriteria text into the dependsOn field (v1.9), visual graph view (v1.9).',
            'DEPENDS ON 6.4.3 — convention must exist before the schema validates it.',
            'Convention: respects every line in tasks/CONVENTIONS.md (popup-for-confirmations).',
        ],
        points: 3,
        dependsOn: ['6.4.3'],
        targetRelease: 'v1.8',
    },
    {
        titlePrefix: '6.4.2',
        acceptanceCriteria: [
            'New scripts/validate-features.ts reads every features/* doc via firebase-admin (existing dev dep).',
            'For each story, scans acceptanceCriteria[] + description for two patterns: (1) Strict pass: /DEPENDS ON \\d+\\.\\d+\\.\\d+/ (canonical from 6.4.3). (2) Loose flag: /\\b\\d+\\.\\d+\\.\\d+\\b/ (catch refs that didn\'t use the canonical prefix — flag as warning, don\'t block).',
            'For every match: lookup target feature by title.startsWith(), verify target exists (else ERROR), verify target.targetRelease ≤ source.targetRelease per RELEASE_WINDOWS order (else ERROR), verify target isn\'t soft-deleted (else ERROR).',
            'Exit code 0 if all pass / 1 if any error.',
            'Wires into npm run validate:plan.',
            'Output is ANSI-coloured, file-grouped, line-anchored so an engineer can act on it directly.',
            'Service-account credential picked up from GOOGLE_APPLICATION_CREDENTIALS env var.',
            'OUT OF SCOPE: GitHub Actions CI workflow that runs this on every PR (deferred to v1.9, 1pt extra), auto-fix mode.',
            'DEPENDS ON 6.4.1 (schema) AND 6.4.3 (convention).',
        ],
        points: 1,
        dependsOn: ['6.4.1', '6.4.3'],
        targetRelease: 'v1.8',
    },
    {
        titlePrefix: '1.3.1',
        acceptanceCriteria: [
            'Schema additions on users/{uid}/quotes/{qid}: isLocked? (boolean, default false), lockedAt?, lockedByUid?, lockedReason? ("sent" | "manual" | "finalised"), version (number, default 1), parentQuoteId? (set on fork).',
            'Auto-lock fires ONCE on FIRST successful 1.2.4 Send (not on finalize, not on subsequent re-sends).',
            'After lock, re-sends are allowed without changing lock state — re-render PDF from current payload, write new sentEmails record.',
            'Edit-locked-quote triggers POPUP AlertDialog: "This quote was sent to {customer} on {date}. Editing creates a new version (v{N+1}). The original stays locked. Continue?" — [Cancel] [Create v2].',
            'Fork = duplicate quote doc into new doc with version: parent.version + 1, parentQuoteId: parent.id, isLocked: false, status: "proposal". Carries over selectedOptions, motor, trailer, content overrides. Audit log fresh on v2.',
            'On fork, user is redirected to the new doc. AuditLog event "version-forked" written on both original (final entry) and new (first entry).',
            'Manual unlock from Activity tab — org-admin only (gated on permissions[role].can_access_settings) → POPUP confirm → set isLocked: false, write auditLog "unlocked".',
            'UI: Lock badge in proposal-view header when isLocked. Hide Edit / Discount editor / Duplicate buttons. Keep Send Quote, Activity, Download PDF.',
            'Lock badge also shows in Backlog quote list.',
            'Firestore rules: match /users/{userId}/quotes/{quoteId} — allow update only if !resource.data.isLocked OR onlyLockFieldsChanged() (whitelists isLocked, lockedAt, lockedByUid, lockedReason, lastSentAt, sentCount, updatedAt).',
            'Firebase Emulator test: power-user with browser dev-tools cannot mutate a locked quote (server rejects).',
            '🚨 firestore.rules CHANGE — DEPLOY RULES banner required.',
            'OUT OF SCOPE: independent customer-record-field locking, time-based auto-unlock, quote-revoke ("send a no-longer-valid email" — v1.9).',
            'DEPENDS ON 1.4.1 — auditLog must exist so lock events can be captured.',
            'Convention: respects every line in tasks/CONVENTIONS.md.',
        ],
        points: 2,
        dependsOn: ['1.4.1'],
        targetRelease: 'v1.8',
    },
    {
        titlePrefix: '1.2.4',
        acceptanceCriteria: [
            'Schema: organisations/{orgId}/emailTemplates/{templateId} with templateType ("send-quote" | "send-contract" | "follow-up"), subject (supports {{customer.name}} merge fields), bodyHtml (TipTap-authored), fromName, fromEmail?, bccEmails[], isDefault (only one per templateType), createdAt, updatedAt.',
            'Schema: users/{ownerUid}/quotes/{qid}/sentEmails/{sendId} with sentAt, sentByUid, sentByName, recipientEmail, recipientName, cc[], bcc[], templateId, subjectFrozen, bodyHtmlFrozen, pdfStoragePath, status ("queued" | "sent" | "bounced" | "failed"), triggerEmailId (FK into mail/{id}), errorMessage?.',
            'Schema: users/{uid}/quotes/{qid} gains lastSentAt? (denormalised) + sentCount? (incremented per send).',
            'Authoring surface: /manage → Document Templates → new "Email" tab. Per-org list of templates with default seed "Send Quote — Default" auto-migrated for orgs that don\'t have one.',
            'Email template edit dialog: TipTap editor for body, single-line input for subject + fromName.',
            'Merge-field picker: dropdown of {{customer.name}}, {{customer.company}}, {{quote.total}}, {{quote.modelName}}, {{salesperson.name}} — clicking inserts literal text at cursor.',
            'Email template live preview pane: renders the template with v1.7 sample-quote fixture customer + total filled in (mirrors content-block live preview pattern).',
            '"Set as default" toggle (Firestore-side enforcement: only one default per templateType per org).',
            'Send surface: new "Send Quote" button on proposal-view next to Download.',
            'Click → POPUP SendQuoteDialog with: To field (default quote.customer.email), Cc / Bcc fields (Bcc default from template), template picker, editable subject + body (pre-rendered with merge fields filled), "Attaching: PDF v{N} — last rendered just now" indicator, [Cancel] [Send] buttons.',
            'On Send: (1) renderQuotePdf() via 1.5.0, (2) upload to users/{uid}/quotes/{qid}/sent/{sendId}.pdf, (3) write mail/{id} doc with to/cc/bcc + message {subject, html} + attachments [{path}], (4) write sentEmails/{sendId} with frozen subject/body + pdfStoragePath + triggerEmailId, (5) write auditLog "sent" event, (6) if first send → trigger 1.3.1 auto-lock + write auditLog "locked", (7) update lastSentAt + sentCount, (8) toast "Quote sent to {recipient}".',
            'Failure handling: if mail/{id} write fails, sentEmails status flips to "failed" + errorMessage, toast error, NO auto-lock (no successful send = no lock).',
            'Re-send works on locked quotes (re-render fresh PDF, write new sentEmails record, lock state unchanged).',
            'Pre-flight: Firebase Trigger Email extension must be wired to a real provider (SendGrid/SMTP) with verified sender domain BEFORE this story builds. Collaborative setup with operator.',
            '🚨 firestore.rules CHANGE — new emailTemplates + sentEmails paths. DEPLOY RULES banner required.',
            'OUT OF SCOPE: e-signature (v1.10), customer portal/accept-reject UI (v1.10+), email open/click tracking via webhooks (v1.9), reply-tracking / customer-comment thread (deferred), scheduled sends (v1.9), multi-recipient with per-recipient body (v1.9), server-side render of PDF for system-initiated sends (v1.9).',
            'DEPENDS ON 1.5.0, 1.4.1, 1.3.1.',
            'Convention: respects every line in tasks/CONVENTIONS.md (popup-for-confirmations, image-preload pattern, server-side fetch for cross-origin assets).',
        ],
        points: 3,
        dependsOn: ['1.5.0', '1.4.1', '1.3.1'],
        targetRelease: 'v1.8',
    },
    {
        titlePrefix: '1.2.3',
        acceptanceCriteria: [
            'Schema: organisations/{orgId}/contentBlocks/{blockId} gains isLockedForQuotes? (boolean) — admin toggle.',
            'Schema: users/{ownerUid}/quotes/{qid}/contentOverrides/{blockType} with html?, subHeader?, overriddenAt, overriddenByUid, overriddenByName.',
            'Resolver chain extension (src/lib/content-blocks.ts): resolveContentBlocksForQuote(firestore, orgId, vendorId, documentType, quoteId?) — when quoteId provided AND block !isLockedForQuotes, check users/{ownerUid}/quotes/{quoteId}/contentOverrides/{blockType} and use that html / subHeader if present.',
            'Override precedence: per-quote override beats brand override beats org default. Lock flag short-circuits the override layer entirely.',
            'Authoring surface (content-block-detail.tsx): new "Lock per-quote overrides for this block" toggle, org admins only.',
            'Toggle popup confirms: "Existing per-quote overrides for this block will continue to render until manually removed. Future quotes will use your authored version. Continue?"',
            'Personalisation surface (proposal-view.tsx): new "Personalise" button next to Activity / Audit / Download.',
            'Click → side sheet (NOT popup — editing surface, mirrors v1.7 content-block-detail edit pattern).',
            'Block picker dropdown — filtered to blocks where isLockedForQuotes !== true.',
            'For each non-locked block: shows resolved stack — org default → brand override (if applicable) → current per-quote override (if any).',
            'Edit per-quote override (same TipTap stack as v1.7, including image upload + resize/align/wrap + sub-header input).',
            '"Reset to default" button → deletes per-quote override doc, falls back to brand-override-or-org-default.',
            'Save → writes to users/{uid}/quotes/{qid}/contentOverrides/{blockType} + fires auditLog "content-overridden" event with {blockType} metadata.',
            'Live preview integration: side sheet has its own live preview pane (reuses ContentBlocksPdfPreview with per-quote override applied) — same debounce + image-preload pattern.',
            'Locked-block UX: when sheet opens, locked blocks show in separate disabled section: "Locked by org admin" with resolved org/brand content rendered read-only. Editor NOT shown.',
            '🚨 firestore.rules CHANGE — new contentOverrides/{blockType} path. DEPLOY RULES banner required.',
            'OUT OF SCOPE: per-block-instance lock (v1.9), mobile-friendly UX (v1.9), per-quote brand override (only org admins), version history of per-quote overrides (audit log captures event, not full diff trail), bulk personalisation across multiple quotes (v1.9).',
            'DEPENDS ON 1.4.1.',
            'Convention: respects every line in tasks/CONVENTIONS.md.',
        ],
        points: 5,
        dependsOn: ['1.4.1'],
        targetRelease: 'v1.8',
    },
    {
        titlePrefix: '1.8.3',
        acceptanceCriteria: [
            'Pre-build schema upgrade: content-block-detail.tsx save handler captures subHeader + documentTypes into versions (today only html is captured). Apply BEFORE diff UI so future versions are diff-complete.',
            'Schema additions on organisations/{orgId}/contentBlocks/{blockId}/versions/{versionId}: subHeader?, documentTypes?: DocumentType[], changeSummary? (optional "Updated FY26 finance terms").',
            'Compare mode in content-block-version-history-drawer.tsx: existing flat list grows a "Compare" button per row.',
            'Click two versions → toggle to diff view.',
            'Toggle: side-by-side OR unified diff (user preference, defaults to unified).',
            'Diff library: diff-match-patch (~10kb gz, transitively present via TipTap).',
            'Image inserts/removes shown as discrete events (not character-diffed).',
            'subHeader changes shown above the body diff.',
            'documentTypes changes shown as a chip diff ("Quote → Quote + Contract").',
            'Save dialog enhancement: optional "What changed?" single-line input above the Save button. Persisted as changeSummary on the version doc. Used as version row label in history drawer (falls back to timestamp).',
            'startsOnNewPage UI (bundled, schema field exists since v1.7): new checkbox in content-block-detail.tsx edit mode: "Start on a new page in the customer PDF". Tooltip: "Forces a page break before this section. Useful for long blocks like T&Cs."',
            'Verify proposal-pdf.tsx renderBlockPages helper actually respects startsOnNewPage — if not, wire it (pageBreakBefore: "always" on the Page or break prop).',
            'OUT OF SCOPE: filter version history by author/date (v1.9), export version as PDF (v1.9), per-paragraph diff toggle (v1.9), auto-summary of changes (v1.9).',
            'DEPENDS ON: nothing.',
            'Convention: respects every line in tasks/CONVENTIONS.md.',
        ],
        points: 3,
        dependsOn: [],
        targetRelease: 'v1.8',
    },
    {
        titlePrefix: '1.8.8',
        acceptanceCriteria: [
            'Export format (no persistent schema): {exportedAt, exportedByUid, exportedByName, exportedFromOrgId, schemaVersion: 1, blocks: [{blockType, html, subHeader, documentTypes, startsOnNewPage, brandOverrides: [{vendorId, html}]}]}.',
            'Downloads as helmlogic-content-blocks-{orgId}-{timestamp}.json.',
            'UI in /manage → Document Templates: menu with Export (downloads JSON of active document type\'s blocks) + Import (file picker or paste JSON).',
            'On import: POPUP preview dialog showing per-block diff: NEW (target org doesn\'t have this blockType), REPLACE (target org has it; becomes new version per CONVENTIONS.md "never clear-and-replace"), SKIP (per-block override, user can opt out).',
            'Per-block toggle in preview: "Replace as new version" (default) / "Skip".',
            'Confirm button → upserts via existing version-history infra (each imported block = a new version on target org\'s block, never destructive).',
            'Image handling: inline image URLs scoped to source org Storage → won\'t display on target org\'s PDF. Per-image warning in import preview: "This block references N image(s) hosted on the source org\'s Storage. They may not display until re-uploaded to your org\'s storage." NOT auto-rehosted.',
            'OUT OF SCOPE: parent → sub-dealer fan-out (v1.9), auto-image-rehosting (v1.9), cross-org "subscribe to updates" mode (deferred).',
            'DEPENDS ON: nothing.',
            'Convention: respects every line in tasks/CONVENTIONS.md.',
        ],
        points: 2,
        dependsOn: [],
        targetRelease: 'v1.8',
    },
    {
        titlePrefix: '1.1.2',
        acceptanceCriteria: [
            'Schema: data-warehouse/{vendorId}/ranges/{rangeId}/models/{modelId}/compatibilityRules/{ruleId} with scope ("option" | "motor" | "seat" | "dealerFit" | "trailer"), type ("requires" | "excludes" | "hpEnvelope" | "engineCount"), predicate (any — shape varies), severity ("warn" | "block"), message (shown verbatim), appliesToVariantIds?: string[], createdByUid, updatedAt.',
            'Predicate shapes: requires → {when: {ids: string[]}, requires: {ids: string[]}}. excludes → {when: {ids: string[]}, excludes: {ids: string[]}}. hpEnvelope → {minHp: number, maxHp: number}. engineCount → {allowed: number[]}.',
            'Evaluator src/lib/compatibility-rules.ts exports evaluateRules(model, currentSelection): RuleResult[] where RuleResult = {ruleId, severity, message, scope, violatingIds[]}.',
            'highfield-quote-flow.tsx: replace existing motor filter loop with evaluateRules(model, selection).',
            'Step header: yellow banner listing all warn violations with their message strings.',
            'Finalize step: hard block violations open POPUP: "This configuration can\'t be finalized because: [reason 1] [reason 2]. Adjust before continuing." Cancel only, no override.',
            'proposal-view.tsx duplicate path: re-evaluates rules → if any violations, yellow warning sheet on duplicated draft.',
            'Existing per-model motorOverrides (hiddenIds / manualIds) folded into evaluator as excludes rules at migration time. Not a parallel system.',
            'Console-pairs-seat lock (currently hardcoded around lockedSeatId) re-expressed as requires rule + auto-excludes rule per console.',
            'Multi-engine HP parsing (v1.4 lesson — getMotorHp() for "2 × 300") pulled into shared compatibility-rules.ts lib. No longer local at line 1046.',
            'Existing finalised quotes don\'t get retro-evaluated on read. Evaluator runs only at edit time.',
            'Highfield rules auto-seed (separate one-shot seed, runs at v1.8 ship time): translates current hardcoded HP envelope from each model.specifications.motorConfigurations[0].engines[0].minHp/maxHp into a hpEnvelope rule. Translates lockedSeatId pairs into requires/excludes rules. Covers Sport, Classic, Roll-Up, Ultra-Light, Adventure, Patrol, Coaster ranges. Idempotent. Removed in cleanup commit per CONVENTIONS.md one-shot lifecycle.',
            'OUT OF SCOPE: admin rule editor in /manage (v1.10), per-state legal HP cap (NSW vs QLD — v1.10), license-class cap (recreational vs commercial — v1.10), cross-vendor rules (v1.10), rule explanation tooltips on filtered options (v1.10 polish).',
            'DEPENDS ON: nothing.',
            'Convention: respects every line in tasks/CONVENTIONS.md (popup-for-confirmations on hard-block violations).',
        ],
        points: 3,
        dependsOn: [],
        targetRelease: 'v1.8',
    },
];

/* ──────────────────────────────────────────────────────────────────
 * RETARGETS — push deferred stories to v1.9.
 * ────────────────────────────────────────────────────────────────── */

const RETARGETS: Retarget[] = [
    {
        titlePrefix: '1.1.3',
        to: 'v1.9',
    },
];

/* ──────────────────────────────────────────────────────────────────
 * SEED RUNNER
 * ────────────────────────────────────────────────────────────────── */

export interface V18PlanningSummary {
    storiesCreated: number;
    storiesUpdated: number;
    storiesSkipped: number;
    dependsOnSet: number;
    retargetsApplied: number;
    storiesMissed: string[];
}

export async function applyV18Planning(firestore: Firestore): Promise<V18PlanningSummary> {
    let storiesCreated = 0;
    let storiesUpdated = 0;
    let storiesSkipped = 0;
    let dependsOnSet = 0;
    let retargetsApplied = 0;
    const storiesMissed: string[] = [];

    // 1. Snapshot existing features for title-prefix matching + epicId inheritance.
    const existing = await getDocs(collection(firestore, 'features'));
    interface ExistingDoc { id: string; data: any; title: string; }
    const allExisting: ExistingDoc[] = [];
    existing.forEach(d => {
        const data = d.data();
        allExisting.push({
            id: d.id,
            data,
            title: ((data.title as string | undefined) ?? '').trim(),
        });
    });

    /**
     * Inherit epicId from a sibling story (e.g. 1.5.0 / 1.4.1 should sit
     * in the same epic as 1.2.4 / 1.3.1 — Customer Quote Lifecycle epic).
     * Picks the first matching v1.8 story's epicId.
     */
    const v18EpicId = allExisting.find(d =>
        d.data.targetRelease === 'v1.8'
        && d.title.startsWith('1.2.4')
    )?.data.epicId
        ?? allExisting.find(d => d.data.targetRelease === 'v1.8')?.data.epicId
        ?? null;

    // 2. CREATE new stories (skip if title-prefix already exists).
    for (const nf of NEW_FEATURES) {
        const titlePrefix = nf.title.split(' — ')[0]; // "1.5.0"
        const exists = allExisting.find(d => d.title.startsWith(titlePrefix));
        if (exists) {
            storiesSkipped++;
            continue;
        }
        await addDoc(collection(firestore, 'features'), {
            title: nf.title,
            description: nf.description,
            acceptanceCriteria: nf.acceptanceCriteria,
            type: nf.type,
            priority: nf.priority,
            status: 'planned',
            points: nf.points,
            targetRelease: nf.targetRelease,
            dependsOn: nf.dependsOn,
            epicId: v18EpicId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        storiesCreated++;
    }

    // 3. CLOBBER acceptance + set points + dependsOn + targetRelease on existing.
    for (const u of STORY_UPDATES) {
        const target = allExisting.find(d => d.title.startsWith(u.titlePrefix));
        if (!target) {
            storiesMissed.push(u.titlePrefix);
            continue;
        }
        const patch: Record<string, any> = {
            acceptanceCriteria: u.acceptanceCriteria,
            dependsOn: u.dependsOn,
            updatedAt: serverTimestamp(),
        };
        if (u.points !== undefined && target.data.points !== u.points) {
            patch.points = u.points;
        }
        if (u.targetRelease && target.data.targetRelease !== u.targetRelease) {
            patch.targetRelease = u.targetRelease;
        }
        await updateDoc(doc(firestore, 'features', target.id), patch);
        storiesUpdated++;
        if (u.dependsOn.length > 0) dependsOnSet++;
    }

    // 4. RETARGET deferred stories.
    for (const r of RETARGETS) {
        const target = allExisting.find(d => d.title.startsWith(r.titlePrefix));
        if (!target) {
            storiesMissed.push(r.titlePrefix);
            continue;
        }
        if (target.data.targetRelease === r.to) {
            storiesSkipped++;
            continue;
        }
        await updateDoc(doc(firestore, 'features', target.id), {
            targetRelease: r.to,
            updatedAt: serverTimestamp(),
        });
        retargetsApplied++;
    }

    return {
        storiesCreated,
        storiesUpdated,
        storiesSkipped,
        dependsOnSet,
        retargetsApplied,
        storiesMissed,
    };
}
