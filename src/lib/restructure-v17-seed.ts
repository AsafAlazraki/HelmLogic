/**
 * v1.7 → v2.2 restructure seed (planning, not shipped).
 *
 * Single-shot Backlog admin button that:
 *
 *   1. Creates Epic 9  Fit-Up & Production       (rose,  order 900)
 *   2. Creates Epic 10 Notifications & Alerts    (cyan,  order 1000)
 *   3. Adds 21 NEW stories
 *        - 9 from the May-2026 backlog-gap consultation
 *          (1.1.4 / 1.2.4 / 1.9.1 / 5.5.5 / 5.7.1 / 8.2.1 / 3.8.1 /
 *           7.1.1 / 10.1.1)
 *        - 8 Epic 9 fit-up stories (9.1.1-4 / 9.2.1-3 / 9.3.1)
 *        - 4 Epic 10 channel stories (10.1.2-5)
 *   4. Re-targets ~30 existing stories per the v1.7 → v2.2 schedule
 *      under the new 20-pt-per-release cap.
 *   5. Adjusts the points field on stories whose pre-existing scope
 *      shrinks because partial implementation already exists in the
 *      codebase (per the May-2026 audit). Examples:
 *        1.4.1 5→3, 1.4.2 3→2, 3.4.1 3→2, 1.5.5 3→2,
 *        and on the new stories 1.9.1 5→3, 5.7.1 5→3, 3.8.1 5→3,
 *        7.1.1 8→5, 10.1.1 8→3.
 *   6. Cross-references existing 2.1.2 (per-MODEL fit-out) with a
 *      one-liner pointing at Epic 9 (per-ITEM fit-up).
 *
 * Capacity check (every release ≤ 20 pts):
 *   v1.7  17 │ v1.8  19 │ v1.9  20 │ v1.10 18 │ v1.11 18 │
 *   v1.12 19 │ v1.13 18 │ v1.14 19 │ v1.15 16 │ v1.16 18 │
 *   v1.17 20 │ v1.18 19 │ v1.19 17 │ v1.20 11 │ v2.0 18 │
 *   v2.1  17 │ v2.2  10
 *   = 17 releases, 290 pts planned, avg 17.1 pts/release, max 20.
 *
 * Idempotent everywhere:
 *   - Epics: skip if doc id already exists
 *   - New stories: skip if a doc already has the same title
 *   - Re-target: only writes if existing targetRelease/points differ
 *   - Cross-ref: only appends the line once
 *
 * Run via "Apply v1.7 → v2.2 restructure" admin button on the Backlog.
 */

import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';
import type { EpicColor, FeaturePriority, FeatureType } from '@/components/feature-tracking-board';

interface SeedEpic {
    id: string;
    title: string;
    shortLabel: string;
    description: string;
    color: EpicColor;
    order: number;
    status: 'planning' | 'active' | 'done';
}

interface SeedFeature {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    type: FeatureType;
    priority: FeaturePriority;
    targetRelease: string;
    points: number | null;
    epicId: string;
}

const story = (role: string, want: string, so: string) =>
    `<p><strong>As a</strong> ${role}<br><strong>I want</strong> ${want}<br><strong>So that</strong> ${so}.</p>`;

/* ──────────────────────────────────────────────────────────────────
 * EPICS
 * ────────────────────────────────────────────────────────────────── */

const NEW_EPICS: SeedEpic[] = [
    {
        id: 'fit-up-production',
        title: 'Fit-Up & Production',
        shortLabel: 'Fit-up',
        description: 'Per-item fit-up tier (Simple / Medium / Complex / None) + cost (incl. + excl. GST), Master Fit-up Catalog with import/export/bulk update, per-module fit-up tab, "include fit-up" checkbox on quote, fit-up cost rendered on customer PDF. Future: rule-based auto-classification (9.3.1).',
        color: 'rose',
        order: 900,
        status: 'planning',
    },
    {
        id: 'notifications-alerts',
        title: 'Notifications & Alerts',
        shortLabel: 'Notifs',
        description: 'EXTENDS the existing in-app notification surface (notification-bell + lib/notifications) with an email channel, per-event-type subscription preferences, digest mode, and notification templates. Per-event channel stories (quote viewed / expiring / contract milestone / deposit due) build on top of 10.1.1.',
        color: 'cyan',
        order: 1000,
        status: 'planning',
    },
];

/* ──────────────────────────────────────────────────────────────────
 * NEW STORIES (21 total: 9 from gap-consult + 8 fit-up + 4 notif channels)
 *
 * Acceptance criteria call out where existing code is being EXTENDED
 * vs built from scratch — so estimates reflect actual remaining work.
 * ────────────────────────────────────────────────────────────────── */

const NEW_FEATURES: SeedFeature[] = [
    /* ── From May-2026 backlog-gap consultation ───────────────────── */
    {
        title: '1.1.4 — Quote Comparison Tool',
        description: story(
            'salesperson',
            'a side-by-side comparison view of two (or three) quote scenarios for the same customer',
            'the customer can compare "Standard vs Premium fit" or hull-only vs hull+motor without me building a spreadsheet',
        ),
        acceptanceCriteria: [
            'EXTENDS existing 1.1.3 Multiple Quote Scenarios (the duplication infrastructure is already there)',
            '"Compare" action on customer detail sheet → pick 2 or 3 scenarios → render side-by-side',
            'Columns aligned: items per row, price per row, totals row, fit-up row',
            'Diff highlighting: rows that differ tinted amber',
            'Export side-by-side comparison to PDF (uses existing template system as a new template type)',
            'Read-only — edits happen in the underlying scenarios',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.15', points: 5, epicId: 'guided-configuration',
    },
    {
        title: '1.2.4 — Email templates / Cover letter editor',
        description: story(
            'sales manager',
            'pre-canned email body templates (cover letters) that the salesperson uses when sending a quote',
            'every quote leaves the building with a consistent, branded cover letter — not a blank email',
        ),
        acceptanceCriteria: [
            'New surface: Org settings → "Email templates" tab',
            'CRUD on templates (TipTap editor, same primitive as feature description)',
            'Variable interpolation: {{customer.name}}, {{quote.number}}, {{quote.value}}, {{salesperson.name}}, {{salesperson.signature}}',
            'Default template per quote-state action (send / accept-confirm / deposit-receipt)',
            '1.4.2 Send Quote Action picks template + lets salesperson edit before sending',
            'Versioning: previous template retained for diff/rollback',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8', points: 3, epicId: 'guided-configuration',
    },
    {
        title: '1.9.1 — Quote Templates (starter quotes)',
        description: story(
            'salesperson',
            'pre-canned starter quotes I can clone (e.g. "Stabicraft 2350 Family Cruiser standard config")',
            'I start a new quote in 30 seconds with the right hull / motor / accessories pre-selected',
        ),
        acceptanceCriteria: [
            'EXTENDS existing template system at /modules/[id]/templates/[templateId] (currently PDF-template designer) with a new template TYPE: "starter-quote"',
            'Save current quote as starter template (name, tags, brand, default category)',
            'New quote dialog: pick from starter template OR start blank',
            'Cloned quote pre-fills SKUs / options / dealer-fit / fit-up tier from the template',
            'Templates org-scoped, listed under Catalog Manager',
            'Estimate revised down from 5pts → 3pts because the template doc-store + designer infra already exists',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.15', points: 3, epicId: 'guided-configuration',
    },
    {
        title: '5.5.5 — Audit Log Viewer UI',
        description: story(
            'admin',
            'a searchable / filterable browser for the 5.5.1 Universal Activity Log data',
            'the audit data is actually USEFUL — without a viewer it just sits in Firestore',
        ),
        acceptanceCriteria: [
            'Companion to 5.5.1 (data capture). Cannot ship before 5.5.1.',
            'New surface: /admin/audit-log',
            'Table columns: Timestamp · Actor · Action · Target type · Target id · Diff (collapsible JSON)',
            'Filter chips: actor, action type, target type, date range',
            'Search by actor name / target id',
            'Click a row → expand diff (before / after with red/green highlight)',
            'Export filtered view to CSV',
            'Read access: org admin only',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.1', points: 3, epicId: 'security-extensibility',
    },
    {
        title: '5.7.1 — User Management UI',
        description: story(
            'org admin',
            'a full user management screen — list, invite, deactivate, change role, see last login',
            'I can run my dealership team without bothering the developer',
        ),
        acceptanceCriteria: [
            'EXTENDS existing manage-organisation-page.tsx (currently has add-user form + role picker)',
            'New: full users list with columns Name · Email · Role · Last login · Status (active / deactivated)',
            'New: deactivate user action (with confirm dialog) — soft delete, reversible',
            'New: change role action with audit log entry (5.5.1)',
            'New: bulk role apply (multi-select rows → assign role)',
            'New: pending invites list (sent but not accepted)',
            'Estimate revised down from 5pts → 3pts because add-user + role-assignment is already built',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v2.1', points: 3, epicId: 'security-extensibility',
    },
    {
        title: '8.2.1 — Reporting & Analytics Dashboard',
        description: story(
            'sales manager',
            'a metrics dashboard with sales-by-rep, conversion rate, time-to-close, top brands, top models',
            'I run the team on data instead of vibes',
        ),
        acceptanceCriteria: [
            'EXTENDS existing /reporting/page.tsx scaffold (currently empty / stock-only)',
            'Sales-by-rep: $ value of contracts, count, conversion %',
            'Conversion rate: quote sent → quote accepted → contract signed',
            'Time-to-close: days from quote sent to contract signed (median, p90)',
            'Top brands by revenue, top models by units, top dealer-fit options',
            'Date range picker (month / quarter / FY / custom)',
            'Per-salesperson drilldown',
            'Charts via existing dashboard-chart.tsx primitive',
            'Depends on 2.4.1 contract conversion existing',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.19', points: 8, epicId: 'sales-operations',
    },
    {
        title: '3.8.1 — Inventory / Stock display on catalog + quote',
        description: story(
            'salesperson',
            'to see "in stock at Northside (qty 2)" vs "build to order, 12 weeks" on every catalog card and quote line',
            'I set customer expectations correctly without checking stock spreadsheets every time',
        ),
        acceptanceCriteria: [
            'EXTENDS existing inventory-list + stock-management workspace (data layer mostly there)',
            'New: stockStatus field on every catalog item: "in-stock" | "build-to-order" | "on-order" | "discontinued"',
            'New: catalog card badge showing stock status (green / amber / slate / red)',
            'New: quote line item shows status + ETA inline',
            'New: stock count display when status = "in-stock" (sourced from existing stock workspace)',
            'New: ETA field for "build-to-order" / "on-order" (number of weeks, configurable per vendor)',
            'Estimate revised down from 5pts → 3pts because stock collection + workspace already exists',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.19', points: 3, epicId: 'data-management',
    },
    {
        title: '7.1.1 — Mobile-responsive quote builder polish',
        description: story(
            'salesperson on a tablet in the showroom',
            'the quote builder to work cleanly at iPad widths and degrade gracefully on phone',
            'I quote a customer standing next to the boat instead of running back to my desktop',
        ),
        acceptanceCriteria: [
            'AUDIT existing breakpoints in highfield-quote-flow.tsx (already uses lg: classes — gap is at md: tablet and sm: phone)',
            'Hero card stacking at md: (motor + boat + trailer panels stack vertically below 1024px)',
            'Tab navigation collapses to bottom sheet on sm:',
            'Form inputs sized for touch (min 44pt tap target)',
            'Dialog placement → full-screen on sm:',
            'Test matrix: iPad (768-1024px landscape + portrait) and iPhone (375-430px portrait)',
            'Estimate revised down from 8pts → 5pts because lg: responsive scaffolding is partially there',
        ],
        type: 'improvement', priority: 'medium', targetRelease: 'v2.2', points: 5, epicId: 'platform-tooling',
    },
    {
        title: '10.1.1 — Notification system foundation (extend existing)',
        description: story(
            'salesperson',
            'to receive notifications when something I care about happens (quote viewed, expiring, contract milestone)',
            'I respond to customer signals instead of waiting for the customer to chase me',
        ),
        acceptanceCriteria: [
            'EXTENDS existing notification-bell + lib/notifications (in-app channel already works)',
            'New: email channel adapter (SMTP via Resend / SendGrid — chosen at integration time)',
            'New: per-event-type subscription preferences UI (per user, in profile settings)',
            'New: digest mode (instant / hourly / daily — choose per channel)',
            'New: notification templates per event type (10.1.2-5 channel stories supply the events)',
            'New: notification preferences default per role (salesperson vs manager get different defaults)',
            'Estimate revised down from 8pts → 3pts because in-app notification surface + collection already shipped',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.20', points: 3, epicId: 'notifications-alerts',
    },

    /* ── Epic 9 Fit-Up stories (8 total) ──────────────────────────── */
    {
        title: '9.1.1 — Master Fit-up Catalog table',
        description: story(
            'admin',
            'a single Fit-up Catalog table that lists every boat / motor / trailer / accessory with its fit-up tier and cost, sortable + filterable by anything',
            'I can manage installation pricing across the entire catalog from one screen instead of editing each item in its module',
        ),
        acceptanceCriteria: [
            'New surface: /admin/fit-up (or tab inside Catalog Manager — TBD during build)',
            'Lists every item across boats / motors / trailers / dealer-fit accessories in one table',
            'Columns: Item name, Vendor, Brand, Range, Vendor type (boat/motor/trailer/accessory), Fit-up tier (Simple/Medium/Complex/None), Fit-up cost ex GST, Fit-up cost inc GST',
            'Search bar (item name, brand, range, SKU)',
            'Filter chips: vendor type, brand, range, tier, "missing fit-up data"',
            'Sortable by every column',
            'Default sort = Vendor type → Brand → Range → Item',
            'Pagination or virtualized scroll (catalog can be large)',
            'Read access: existing catalog admin role',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.16', points: 3, epicId: 'fit-up-production',
    },
    {
        title: '9.1.2 — Inline edit per-item fit-up tier + cost',
        description: story(
            'admin',
            'to click into a row and edit fit-up tier / cost without opening a separate dialog',
            'updating fit-up data is as fast as the Catalog Manager inline-edit pattern',
        ),
        acceptanceCriteria: [
            'Click tier cell → dropdown (Simple / Medium / Complex / None)',
            'Click cost cell → number input',
            'Inc-GST cell auto-computes from ex-GST × 1.10 with Math.ceil (per global GST rule)',
            'Save on blur or Enter; cancel on Escape',
            'Optimistic UI; toast on save failure with rollback',
            'Audit fields updated: lastFitUpUpdateBy, lastFitUpUpdateAt',
            'Bulk-select multiple rows → "Apply tier to all" / "Apply cost to all" (lightweight bulk, NOT 9.1.4 import path)',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.17', points: 2, epicId: 'fit-up-production',
    },
    {
        title: '9.1.3 — Import / export fit-up data (CSV / XLSX)',
        description: story(
            'admin',
            'to import fit-up costs in bulk from a spreadsheet and export the current state for review',
            'I can prepare fit-up pricing offline (or in a vendor sheet) and load it once, the same way Pricing Manager handles MPF imports',
        ),
        acceptanceCriteria: [
            'Export button → downloads CSV/XLSX of every catalog item with current tier + costs',
            'Import button → upload CSV/XLSX, schema same as export',
            'Upsert by natural key (Part Number / SKU / Model Code, per the v1.4 import-discipline lesson) — NEVER clear-and-replace',
            'Diff preview before commit: N updated · M created · K skipped (no key) · L unchanged',
            'Diff highlights tier-change and >20% cost-change rows in amber so the operator can sanity-check',
            'Toast summary after commit',
            'Audit log entry per import (who, when, file name, row counts)',
        ],
        type: 'improvement', priority: 'medium', targetRelease: 'Unscheduled', points: 3, epicId: 'fit-up-production',
    },
    {
        title: '9.1.4 — Bulk update + global markup tools',
        description: story(
            'admin',
            'to apply a % markup or copy a tier across many items at once',
            'I can adjust fit-up rates org-wide (e.g., labor rate goes up 8% next quarter) without re-editing each row',
        ),
        acceptanceCriteria: [
            'Multi-row select via checkbox column',
            'Toolbar appears with selection count + actions: Set tier, Set cost, Apply % markup, Copy from another tier, Clear fit-up data',
            'Apply % markup: prompt for percent, applies to ex-GST cost; inc-GST recomputes',
            'Confirmation dialog showing affected row count before commit',
            'Idempotent — re-running same markup on same rows replays cleanly',
            'Audit log per bulk action (selection criteria, change applied, row count)',
        ],
        type: 'improvement', priority: 'nice-to-have', targetRelease: 'Unscheduled', points: 2, epicId: 'fit-up-production',
    },
    {
        title: '9.2.1 — Fit-up tab on each module page',
        description: story(
            'module owner (boat / motor / trailer)',
            'a Fit-up tab inside my module page that shows just MY items with their fit-up tier + cost, and lets me edit inline',
            'I can manage fit-up data in the same place I already manage prices, without bouncing to the master catalog',
        ),
        acceptanceCriteria: [
            'New "Fit-up" tab inside each vendor module page (Highfield Boats, Yamaha Motors, etc.)',
            'Lists only items belonging to this module (boats from this vendor, motors from this vendor, etc.)',
            'Same columns + inline edit as 9.1.2',
            'Edits write to the SAME catalog item docs as 9.1.1 — no per-module duplicate of fit-up data',
            'Whichever surface (master or per-module) was last edited wins (last-write-wins, audit field captures who)',
            'Read access mirrors module admin role',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v2.1', points: 2, epicId: 'fit-up-production',
    },
    {
        title: '9.2.2 — "Include fit-up" checkbox on quote builder',
        description: story(
            'salesperson',
            'a single tickbox at the end of the quote that adds the fit-up cost for every item in the quote',
            'I include installation in the price without manually adding it for each accessory',
        ),
        acceptanceCriteria: [
            'New tickbox "Include fit-up" near the existing quote totals section',
            'When ticked: system sums fitUpCostExGst across every included item (boat + motor + trailer + dealer-fit accessories)',
            'Sum displayed as a single line in the quote totals: "Fit-up — $X,XXX (ex GST) / $Y,YYY (inc GST)"',
            'Items with fitUpTier="none" or fitUpCostExGst=0 contribute nothing',
            'Tickbox state snapshotted into quote.fitUp = { included, costExGst, costIncGst, breakdown[] } at finalize (per the v1.4 pick-time-snapshot lesson)',
            'Breakdown[] captures itemId + itemName + tier + cost so PDF + future audits work even if catalog changes',
            'Default = unticked',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.16', points: 1, epicId: 'fit-up-production',
    },
    {
        title: '9.2.3 — Fit-up section on customer-facing quote PDF',
        description: story(
            'salesperson',
            'the fit-up cost rendered on the customer PDF when the tickbox in 9.2.2 is on',
            'the customer sees what they\'re paying for installation, separate from the boat / motor sticker price',
        ),
        acceptanceCriteria: [
            'When quote.fitUp.included = true, PDF renders a single "Fit-up & rigging" line after the items list and before totals',
            'Single summary line only — no per-item breakdown on the customer PDF (per Asaf, marine-sales convention)',
            'Format: "Fit-up & rigging: $X,XXX (ex GST) / $Y,YYY (inc GST)"',
            'Inc-GST per the global GST rule (Math.ceil(exGst × 1.10))',
            'Section omitted entirely when quote.fitUp.included = false',
            'Reads from the quote.fitUp snapshot — never re-queries live catalog',
            'Internal-only "Fit-up breakdown" view available in the salesman\'s quote detail page (NOT on customer PDF) for diagnosis / margin review',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.16', points: 1, epicId: 'fit-up-production',
    },
    {
        title: '9.3.1 — Rule-based fit-up tier auto-classification',
        description: story(
            'admin',
            'to define rules that auto-classify a quote\'s overall fit-up tier based on which items are selected ("if items A+B+C selected → Simple; D+E+F → Medium; G+H → Complex")',
            'fit-up pricing matches the actual installation complexity of the selected combination, not just the additive sum of per-item costs',
        ),
        acceptanceCriteria: [
            'Rule editor UI: pick items + tier + flat tier price (e.g. "Selected items include {A, B, C} → Simple → $1,200")',
            'Multiple rules with priority order (first match wins)',
            'Default tier when no rule matches (e.g. fall back to additive sum from 9.2.2)',
            'Quote builder: when rules are configured, "Include fit-up" applies the rule-driven flat price INSTEAD of the per-item sum',
            'PDF section (9.2.3) shows the matched rule name + tier + flat price',
            'Quote snapshot captures matched rule id + tier + price at finalize',
            'Builds on top of 9.1.x + 9.2.x — depends on the per-item tier classifications already existing',
            'EXPLICITLY future scope per Asaf — captured now to keep the data model upgrade-safe (don\'t lock 9.2.2 sum logic in a way that blocks rule replacement)',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.2', points: 5, epicId: 'fit-up-production',
    },

    /* ── Epic 10 channel stories (4) ───────────────────────────────── */
    {
        title: '10.1.2 — Quote-viewed notification',
        description: story(
            'salesperson',
            'a notification when the customer opens the PDF of a quote I sent them',
            'I follow up at exactly the right moment — when the customer is thinking about it',
        ),
        acceptanceCriteria: [
            'Tracked via 1.3.3 SharePoint open event OR a tracking-pixel in the email body (depending on send channel)',
            'Notification body: "{{customer.name}} viewed quote {{quote.number}} ({{quote.value}}) {{relative-time}}"',
            'Both in-app and email channel (per user preference from 10.1.1)',
            'Quote.lifecycleState transitions to "Viewed" if currently "Sent"',
            'De-duped: one notification per quote per day (don\'t spam if the customer reopens repeatedly)',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.1', points: 2, epicId: 'notifications-alerts',
    },
    {
        title: '10.1.3 — Quote-expiring notification',
        description: story(
            'salesperson',
            'a notification 7 days and 1 day before a quote expires',
            'I follow up to renew or close the quote before it lapses',
        ),
        acceptanceCriteria: [
            'Depends on 1.4.4 Quote Validity / Expiry (validity date on every quote)',
            'Daily Cloud Function scans quotes with state="Sent" and validUntil within 7d / 1d',
            'Notification body: "Quote {{quote.number}} for {{customer.name}} expires in {{N}} days ($X,XXX)"',
            'In-app + email per 10.1.1 preferences',
            'One notification per threshold (7d, 1d) — not daily spam',
            'Cancel notification if state changes (Accepted / Rejected / Cancelled before expiry)',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.1', points: 2, epicId: 'notifications-alerts',
    },
    {
        title: '10.1.4 — Contract milestone notifications',
        description: story(
            'sales manager',
            'notifications when a contract hits a milestone (deposit received / build start / ready for delivery / settled)',
            'I see the production pipeline progressing without checking each contract',
        ),
        acceptanceCriteria: [
            'Depends on 2.4.1 contract state machine + 2.4.3 Payment Schedule',
            'Notification per state transition: "{{customer.name}} contract {{contract.number}} → {{state}}"',
            'Configurable per state (some managers want delivery-only, some want every step)',
            'In-app + email per 10.1.1',
            'Goes to: contract owner (salesperson) + manager + ops captain (per role-based subscription)',
            'Daily digest mode rolls multiple state transitions into one summary email',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'Unscheduled', points: 3, epicId: 'notifications-alerts',
    },
    {
        title: '10.1.5 — Deposit-due notification',
        description: story(
            'finance stakeholder',
            'a notification when a contract has been signed but no deposit received within X days',
            'I chase the deposit before the build slot is wasted',
        ),
        acceptanceCriteria: [
            'Depends on 2.4.2 Deposit Recording + 2.4.4 Outstanding Balance',
            'Daily scan: contracts in state "Awaiting deposit" with sign-date > 7 days ago',
            'Notification: "Contract {{contract.number}} signed {{N}} days ago — deposit ${{amount}} still outstanding"',
            'Goes to: contract owner + finance role + manager',
            'Repeat at 7d / 14d / 30d (escalating urgency)',
            'Cancel notification when deposit recorded',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'Unscheduled', points: 2, epicId: 'notifications-alerts',
    },
];

/* ──────────────────────────────────────────────────────────────────
 * RE-TARGET MAPPING (existing stories → new release)
 *
 * Find by title prefix (the "X.Y.Z — Foo bar" pattern). Update
 * targetRelease (always) and points (only if specified — for stories
 * whose scope shrinks because partial implementation already exists).
 * Idempotent: only writes if the existing field differs.
 * ────────────────────────────────────────────────────────────────── */

interface Retarget {
    prefix: string;
    release: string;
    /** Only set if the audit found existing partial code that shrinks scope. */
    points?: number;
}

const RETARGETS: Retarget[] = [
    /* v1.7 — Branded PDF + Compatibility (17) */
    { prefix: '1.1.2 — Compatibility Rule',           release: 'v1.7' },
    { prefix: '1.1.3 — Multiple Quote Scenarios',      release: 'v1.7' },
    { prefix: '1.2.1 — Branded PDF Quote Generation',  release: 'v1.7' },
    { prefix: '1.2.2 — Brand-Aware Content Injection', release: 'v1.7' },

    /* v1.8 — Personalisation + Content Manager (19) */
    { prefix: '1.2.3 — Controlled Personalisation',    release: 'v1.8' },
    { prefix: '1.8.1 — Quote Content Block Manager',   release: 'v1.8' },
    { prefix: '1.8.2 — Image upload per content block', release: 'v1.8' },
    { prefix: '1.8.3 — Content block layout',          release: 'v1.8' },
    { prefix: '1.3.1 — Finalised Quote Locking',       release: 'v1.8' },

    /* v1.9 — Contract + SharePoint + Lifecycle start (20) */
    { prefix: '1.3.2 — Contract Signing Pack',         release: 'v1.9' },
    { prefix: '1.3.3 — SharePoint Quote Storage',      release: 'v1.9' },
    { prefix: '1.4.1 — Quote Lifecycle States',        release: 'v1.9', points: 3 },
    { prefix: '1.8.4 — Quote preview button',          release: 'v1.9' },
    { prefix: '2.1.1 — Structured Price Sources',      release: 'v1.9' },

    /* v1.10 — Quote Lifecycle cont. + Customer Detail (18) */
    { prefix: '1.4.2 — Send Quote Action',             release: 'v1.10', points: 2 },
    { prefix: '1.4.3 — Acceptance Capture',            release: 'v1.10' },
    { prefix: '1.4.4 — Quote Validity',                release: 'v1.10' },
    { prefix: '1.4.5 — Quote Versioning per Customer', release: 'v1.10' },
    { prefix: '8.1.2 — Customer Detail Sheet',         release: 'v1.10' },

    /* v1.11 — Customer Schema + Contract Conversion (18) */
    { prefix: '3.4.1 — Customer Schema Redesign',      release: 'v1.11', points: 2 },
    { prefix: '1.5.3 — Customer Notes Timeline',       release: 'v1.11' },
    { prefix: '1.5.4 — Customer Source Tracking',      release: 'v1.11' },
    { prefix: '2.4.1 — Convert Quote',                 release: 'v1.11' },
    { prefix: '2.4.2 — Deposit Recording',             release: 'v1.11' },

    /* v1.12 — Pricing + Margin (19) */
    { prefix: '2.1.2 — Model-Specific Fit-Out',        release: 'v1.12' },
    { prefix: '2.2.1 — Margin Threshold',              release: 'v1.12' },
    { prefix: '2.2.2 — Role-Based Margin',             release: 'v1.12' },
    { prefix: '2.7.1 — Margin Threshold Configuration', release: 'v1.12' },
    { prefix: '3.5.1 — Suggestion Approval',           release: 'v1.12' },

    /* v1.13 — Sales Workspace + Comms + Trade-in (18) */
    { prefix: '8.1.1 — Sales workspace shell',         release: 'v1.13' },
    { prefix: '8.1.3 — Customer Pipeline View',        release: 'v1.13' },
    { prefix: '1.6.1 — Comms Log',                     release: 'v1.13' },
    { prefix: '1.5.5 — Trade-In Record',               release: 'v1.13', points: 2 },

    /* v1.14 — Variations + Promo entry (19) */
    { prefix: '2.3.1 — Quote Variations',              release: 'v1.14' },
    { prefix: '2.6.1 — Variation Order Document',      release: 'v1.14' },
    { prefix: '2.6.2 — Variation History',             release: 'v1.14' },
    { prefix: '2.6.3 — Customer Agreement on Variation', release: 'v1.14' },
    { prefix: '4.1.1 — Promotion Entry',               release: 'v1.14' },

    /* v1.15 — Customer Docs (templates + comparison are NEW above)  (16) */
    { prefix: '1.5.6 — Spouse',                        release: 'v1.15' },
    { prefix: '1.5.7 — Customer Document Storage',     release: 'v1.15' },

    /* v1.16 — Data + Fit-up Catalog + Promo Alerts (18 — fit-up rows added via NEW) */
    { prefix: '3.1.1 — Structured Data Imports',       release: 'v1.16' },
    { prefix: '3.2.1 — Internal Data Normalisation',   release: 'v1.16' },
    { prefix: '3.6.1 — Inbound Import Idempotency',    release: 'v1.16' },
    { prefix: '4.1.2 — Promotion Alerts',              release: 'v1.16' },

    /* v1.17 — Pipeline + Search + X-module Quotes (20) */
    { prefix: '1.7.1 — Sales Pipeline Dashboard',      release: 'v1.17' },
    { prefix: '1.7.3 — Recent Activity Feed',          release: 'v1.17' },
    { prefix: '1.7.4 — Global Search',                 release: 'v1.17' },
    { prefix: '8.1.4 — Cross-module Quotes',           release: 'v1.17' },

    /* v1.18 — Marketing + Payment Schedule (19) */
    { prefix: '3.4.2 — Marketing Copy Editor',         release: 'v1.18' },
    { prefix: '3.4.3 — Photo Curation',                release: 'v1.18' },
    { prefix: '2.4.3 — Payment Schedule',              release: 'v1.18' },
    { prefix: '2.4.4 — Outstanding Balance',           release: 'v1.18' },

    /* v1.19 — X-module Contracts + Reporting + Inventory (17 — Reporting + Inventory are NEW above) */
    { prefix: '8.1.5 — Cross-module Contracts',        release: 'v1.19' },
    { prefix: '8.1.6 — My Quotes / My Customers',      release: 'v1.19' },

    /* v1.20 — Brand Isolation + Notifications foundation (11 — 10.1.1 NEW above) */
    { prefix: '5.2.1 — Brand & Dealer Isolation',      release: 'v1.20' },

    /* v2.0 (MVP) — Crowdsource + Flexible Units + Activity Log (18) */
    { prefix: '3.3.1 — Crowdsourced Suggestions',      release: 'v2.0' },
    { prefix: '5.1.1 — Flexible Quoting Units',        release: 'v2.0' },
    { prefix: '5.5.1 — Universal Activity Log',        release: 'v2.0' },

    /* v2.1 — Notif channels + Audit viewer + User Mgmt + Brand onboarding + Fit-up tab + Saved views (17) */
    { prefix: '5.3.1 — Brand Onboarding',              release: 'v2.1' },
    { prefix: '8.1.7 — Saved filter views',            release: 'v2.1' },

    /* v2.2 — Mobile + Fit-up rules (10 — both are NEW above) */
];

/* ──────────────────────────────────────────────────────────────────
 * CROSS-REFERENCES
 * ────────────────────────────────────────────────────────────────── */

interface CrossRef {
    titlePrefix: string;
    line: string;
}

const CROSS_REFS: CrossRef[] = [
    {
        titlePrefix: '2.1.2 — Model-Specific Fit-Out',
        line: 'Per-MODEL boat-level tier pricing (this story); Epic 9 (Fit-Up & Production) covers per-ITEM fit-up costs orthogonally — both can coexist on a quote (boat\'s base fit-out + per-accessory installation overlay)',
    },
];

/* ──────────────────────────────────────────────────────────────────
 * SEED RUNNER
 * ────────────────────────────────────────────────────────────────── */

export interface RestructureSeedSummary {
    epicsCreated: number;
    epicsSkipped: number;
    featuresCreated: number;
    featuresSkipped: number;
    retargetsApplied: number;
    retargetsSkipped: number;
    pointsAdjusted: number;
    crossRefsApplied: number;
    crossRefsSkipped: number;
    retargetsMissed: string[];
}

export async function applyV17Restructure(
    firestore: Firestore,
    submitterUid: string,
    submitterName: string,
): Promise<RestructureSeedSummary> {
    let epicsCreated = 0;
    let epicsSkipped = 0;
    let featuresCreated = 0;
    let featuresSkipped = 0;
    let retargetsApplied = 0;
    let retargetsSkipped = 0;
    let pointsAdjusted = 0;
    let crossRefsApplied = 0;
    let crossRefsSkipped = 0;
    const retargetsMissed: string[] = [];

    /* 1. Create epics. */
    for (const e of NEW_EPICS) {
        const ref = doc(firestore, 'epics', e.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            epicsSkipped++;
            continue;
        }
        await setDoc(ref, {
            title: e.title,
            shortLabel: e.shortLabel,
            description: e.description,
            color: e.color,
            order: e.order,
            status: e.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        epicsCreated++;
    }

    /* 2. Single read of every feature for new-story dedupe + retarget + cross-ref. */
    const existing = await getDocs(collection(firestore, 'features'));
    interface ExistingDoc { id: string; data: any; title: string; }
    const existingTitles = new Set<string>();
    const allExisting: ExistingDoc[] = [];
    existing.forEach(d => {
        const data = d.data();
        const t = (data.title as string | undefined)?.trim() ?? '';
        if (t) existingTitles.add(t);
        allExisting.push({ id: d.id, data, title: t });
    });

    /* 3. Create new features. */
    for (const f of NEW_FEATURES) {
        if (existingTitles.has(f.title.trim())) {
            featuresSkipped++;
            continue;
        }
        await addDoc(collection(firestore, 'features'), {
            title: f.title,
            description: f.description,
            acceptanceCriteria: f.acceptanceCriteria,
            type: f.type,
            status: 'submitted',
            priority: f.priority,
            targetRelease: f.targetRelease,
            points: f.points,
            epicId: f.epicId,
            tags: [],
            voteIds: [],
            imageUrls: [],
            commentCount: 0,
            deletedAt: null,
            deletedBy: null,
            order: 0,
            submitterId: submitterUid,
            submitterName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        featuresCreated++;
    }

    /* 4. Re-target existing features. */
    for (const r of RETARGETS) {
        const target = allExisting.find(d => d.title.startsWith(r.prefix));
        if (!target) {
            retargetsMissed.push(r.prefix);
            continue;
        }
        const currentRelease = target.data.targetRelease ?? null;
        const currentPoints = target.data.points ?? null;
        const releaseDiffers = currentRelease !== r.release;
        const pointsDiffer = r.points !== undefined && currentPoints !== r.points;
        if (!releaseDiffers && !pointsDiffer) {
            retargetsSkipped++;
            continue;
        }
        const patch: Record<string, any> = { updatedAt: serverTimestamp() };
        if (releaseDiffers) patch.targetRelease = r.release;
        if (pointsDiffer) {
            patch.points = r.points;
            pointsAdjusted++;
        }
        await updateDoc(doc(firestore, 'features', target.id), patch);
        if (releaseDiffers) retargetsApplied++;
    }

    /* 5. Cross-references. */
    for (const ref of CROSS_REFS) {
        const target = allExisting.find(d => d.title.startsWith(ref.titlePrefix));
        if (!target) {
            crossRefsSkipped++;
            continue;
        }
        const currentAc: string[] = Array.isArray(target.data.acceptanceCriteria)
            ? target.data.acceptanceCriteria
            : [];
        if (currentAc.includes(ref.line)) {
            crossRefsSkipped++;
            continue;
        }
        await updateDoc(doc(firestore, 'features', target.id), {
            acceptanceCriteria: [...currentAc, ref.line],
            updatedAt: serverTimestamp(),
        });
        crossRefsApplied++;
    }

    return {
        epicsCreated,
        epicsSkipped,
        featuresCreated,
        featuresSkipped,
        retargetsApplied,
        retargetsSkipped,
        pointsAdjusted,
        crossRefsApplied,
        crossRefsSkipped,
        retargetsMissed,
    };
}
