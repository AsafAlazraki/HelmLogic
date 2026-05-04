/**
 * Catalog Manager backlog seed (planning, not shipped).
 *
 * Seeds 25 backlog items under Epic 3 (Data Management & Sustainability)
 * + Epic 6 (Launch Prep & Ops) that comprise the Master Catalog Manager
 * initiative — a unified per-vendor-type admin table that replaces the
 * existing Pricing Manager + HighfieldModelEditor.
 *
 * 5 phases (imports + diff preview pulled forward from Phase E so
 * Catalog Manager ships with full Pricing Manager parity).
 * Trailers table (3.7.4) + import migration (3.7.7) pushed to v1.7.5
 * to keep v1.8 within cap:
 *   A.1 — Trailers + import migration → v1.7.5     (2 stories, 5 pts)
 *   A   — Scaffolding + parity audit  → v1.8       (6 stories, 15 pts)
 *   B   — Inline editing + audit + export + decommission → v1.8.5 (9 stories, 21 pts) (incl. 1 content @ 1 pt)
 *   C   — Compatibility + options + exchange rates → v2.0         (5 stories, 11 pts)
 *   D   — Bulk operations                          → Unscheduled  (4 stories, 11 pts)
 *   E   — Importer plug-in registry                → Unscheduled  (1 story, 5 pts)
 *
 * Plus 2 ops tasks under Epic 6 (Launch Prep): data backfill (v1.8) +
 * operator training (v1.9).
 *
 * Capacity impact (caps at 40 / amber at 35 / red at 50):
 *   v1.7.5     : 34 → 39 pts (within cap)
 *   v1.8       : 23 → 38 pts (within cap)
 *   v1.8.5     : 23 → 44 pts (amber — accepted overage)
 *   v2.0       : 29 → 40 pts (at cap)
 *   Unscheduled: +16 pts
 *
 * Idempotent: skips by exact title match. Run via the "Populate Catalog
 * Manager backlog" admin button on the Backlog. Status='submitted' on
 * every story (these are PROPOSED scope, not shipped). Mark accepts each
 * one through the standard Accept button as he reviews.
 */

import {
    addDoc,
    collection,
    getDocs,
    serverTimestamp,
    type Firestore,
} from 'firebase/firestore';
import type { FeaturePriority, FeatureType } from '@/components/feature-tracking-board';

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
    `<p><strong>As an</strong> ${role}<br><strong>I want</strong> ${want}<br><strong>So that</strong> ${so}.</p>`;

const activity = (body: string) => `<p><strong>Activity:</strong> ${body}</p>`;

const FEATURES: SeedFeature[] = [
    // ─── Phase A — Scaffolding + read views (v1.8, 14 pts) ────────────────
    {
        title: '3.7.1 — /catalog-manager route + 3-tab switcher (Boats / Motors / Trailers)',
        description: story(
            'admin',
            'one top-level admin surface that replaces the per-module Pricing Manager and the per-model editor pages',
            'I have a single place to manage every catalog item — pricing, specs, images, descriptions, compatibility — without hunting through module pages',
        ),
        acceptanceCriteria: [
            'New /catalog-manager route added behind the existing admin gate',
            '3-tab switcher: Boats | Motors | Trailers (URL-synced via ?tab=)',
            'Sidebar entry between Pricing Manager (now redirects) and Settings',
            '"Open in Catalog Manager" link added to each module page header',
            'Page-level guard: non-admin users see a "Not available" panel',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8', points: 3, epicId: 'data-management',
    },
    {
        title: '3.7.2 — Boats table — read view (model rows, expandable to variant sub-rows)',
        description: story(
            'admin',
            'a single table that shows every boat in the catalog with all the fields I currently edit across multiple pages',
            'I can scan, compare, and triage data quality without clicking into individual model editors',
        ),
        acceptanceCriteria: [
            'Row = model. Click to expand into variant sub-rows (per-SKU price + colour + material).',
            'Columns: code, name, range, HP min-max, capacity, LOA, beam, dry weight, base sell price (default level), cost, margin %, image thumb',
            'Reads from data-warehouse/{vendorId}/ranges/.../models/.../variants merged with org modelOverrides',
            'Sortable + filterable by range and vendor',
            'Empty / missing required fields render with red highlight',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8', points: 5, epicId: 'data-management',
    },
    {
        title: '3.7.3 — Motors table — read view',
        description: story(
            'admin',
            'a table of every motor in the catalog (Yamaha + other motor brands)',
            'I can see all motor pricing and specs at once instead of one model at a time',
        ),
        acceptanceCriteria: [
            'Columns: part number, model code, HP rating, weight, shaft length, steering type, NSM Retail / Trade / Commercial / Boating Alliance prices, cost, margin %',
            'HP parsed correctly from multi-engine entries (e.g. "2 × 300" → 300 per engine)',
            'Filterable by motor brand / vendor',
            'Reads via getDocs across selected motor vendors (rules-of-hooks aside, follows v1.4 trailer-dashboard pattern)',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8', points: 3, epicId: 'data-management',
    },
    {
        title: '3.7.4 — Trailers table — read view',
        description: story(
            'admin',
            'a table of every trailer in the catalog with per-state rego cost surfaced',
            'I can confirm pricing and rego accuracy across brands without opening each model',
        ),
        acceptanceCriteria: [
            'Columns: brand, model, capacity, suspension, brakes, retail price, cost, margin %, image thumb',
            'Per-state rego cost surfaced as a sub-column group (NSW / VIC / QLD / etc.) sourced from the v1.4 Rego module',
            'Empty / missing required fields render with red highlight',
            'Filterable by trailer brand',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7.5', points: 3, epicId: 'data-management',
    },
    {
        title: '3.7.5 — Pricing Manager feature parity audit',
        description: activity(
            'Walk every feature on the existing /pricing-manager and per-module Pricing Manager surfaces. For each capability (Yamaha MPF import, Sam Allen import, Trailer pricing import, org overrides, price-level toggles, margin band display, cost vs sell views, exchange-rate adjustments, delivered-deals tracking, stock dashboard), produce a "Catalog Manager equivalent" mapping — done / wrapped / dropped / new story. Output: a checklist that gates the 3.8.7 decommission story.',
        ),
        acceptanceCriteria: [
            'Feature inventory of /pricing-manager + per-module Pricing Manager produced',
            'Each entry mapped to: done in Phase A/B / new story added / explicitly dropped (with rationale)',
            'No "unknown" rows — every legacy feature has a future state',
            'Checklist filed in tasks/ and referenced from 3.8.7',
        ],
        type: 'task', priority: 'high', targetRelease: 'v1.8', points: 2, epicId: 'data-management',
    },
    {
        title: '3.7.6 — Org-level pricing overrides surfaced inline in catalog tables',
        description: story(
            'admin',
            'each pricing cell to show both the catalog-level value and the org override (when present), with the ability to edit either side',
            'NSM-specific pricing decisions are visible alongside the global catalog without switching pages',
        ),
        acceptanceCriteria: [
            'Pricing cell renders as "Catalog $X · NSM $Y" when an override exists, single value when not',
            'Edit popover lets the admin set / clear the org override, and edit the catalog value separately',
            'Reads + writes to organisations/{orgId}/modelOverrides/{modelId} for org-side, data-warehouse/.../variants for catalog-side',
            'Audit trail (3.8.5) captures which side was edited',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8', points: 2, epicId: 'data-management',
    },
    {
        title: '3.7.7 — Migrate per-vendor imports under catalog tabs (was 3.11.1, pulled forward)',
        description: story(
            'admin',
            'the existing Yamaha MPF / Sam Allen / Trailer pricing import buttons living inside /catalog-manager next to the data they affect',
            'data ingestion is in one place and the Catalog Manager ships with full Pricing Manager parity',
        ),
        acceptanceCriteria: [
            '"Import" dropdown on each tab listing the vendors importable for that type',
            'Existing importers wrapped without changing their key-based upsert logic (per v1.4 lesson)',
            'Old import buttons removed from the per-module Pricing Manager',
            'Toast summary unchanged: N updated · M created · K skipped',
        ],
        type: 'improvement', priority: 'high', targetRelease: 'v1.7.5', points: 2, epicId: 'data-management',
    },
    {
        title: '3.7.8 — Decision: Delivered deals + stock dashboard placement',
        description: activity(
            'The per-module Pricing Manager today also surfaces delivered-deals tracking and a stock dashboard. These are arguably operations dashboards, not catalog management. Decide: (a) fold them into Catalog Manager as additional tabs, (b) leave them where they are with cross-links from the Catalog Manager, or (c) move them to a future Operations Dashboard surface. Output gates the 3.8.7 decommission story for the parts that touch these pages.',
        ),
        acceptanceCriteria: [
            'Decision recorded in tasks/ with rationale',
            'If (a): added as Phase B+ stories under Epic 3 with point estimates',
            'If (b) or (c): explicit "stays here / will move later" entries on the parity-audit checklist',
        ],
        type: 'decision', priority: 'medium', targetRelease: 'v1.8', points: null, epicId: 'data-management',
    },

    // ─── Phase B — Inline editing + audit (v1.8.5, 12 pts) ────────────────
    {
        title: '3.8.1 — Inline edit: pricing fields (price levels, cost, GST flags, margin recalcs)',
        description: story(
            'admin',
            'to edit any pricing cell directly in the table',
            'updating a price is a 2-second click-tab-tab-Enter, not a 6-click page navigation',
        ),
        acceptanceCriteria: [
            'Click a pricing cell → in-cell editor (Input or Select)',
            'Save on blur with dirty indicator while editing',
            'Margin % auto-recalcs on price OR cost change',
            'Inc-GST values rounded UP to whole dollars per the v1.3 lesson',
            'Toast confirmation per write',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8.5', points: 3, epicId: 'data-management',
    },
    {
        title: '3.8.2 — Inline edit: spec fields (HP range, capacity, dimensions, dry weight, fuel capacity)',
        description: story(
            'admin',
            'to edit spec values directly in the catalog table',
            'fixing a wrong dimension or HP rating doesn\'t require diving through the buried HighfieldModelEditor',
        ),
        acceptanceCriteria: [
            'Click a spec cell → in-cell editor',
            'Numeric fields validated on blur',
            'Saves to the model doc — same path the existing model editor writes to',
            'HP-range fields support multi-engine syntax (parsed back out for the motor compat window)',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8.5', points: 3, epicId: 'data-management',
    },
    {
        title: '3.8.3 — Inline edit: cover image (drag-drop or paste URL)',
        description: story(
            'admin',
            'to swap a catalog image directly from the table',
            'a cover photo update doesn\'t require opening the model editor',
        ),
        acceptanceCriteria: [
            'Click image thumb → opens uploader popover (drag-drop or paste URL)',
            'Reuses the v1.5 feature-image-uploader pattern',
            'Persists to data-warehouse model doc; org override layer respected',
            'External URLs use native <img> per v1.4 lesson (Cloudflare anti-hotlinking)',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.8.5', points: 2, epicId: 'data-management',
    },
    {
        title: '3.8.4 — Inline edit: marketing description (TipTap popover)',
        description: story(
            'admin',
            'to edit a model\'s marketing description from the table',
            'copy fixes don\'t require leaving the catalog view',
        ),
        acceptanceCriteria: [
            'Click description cell → TipTap editor in a popover',
            'Reuses the FeatureRichTextEditor from Feature Tracking',
            'Saves on blur (NOT on every keystroke per the v1.5 lesson)',
            'Org-level overlay respected: NSM-overlaid copy displays + edits the org override doc, not the global catalog doc',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v1.8.5', points: 2, epicId: 'data-management',
    },
    {
        title: '3.8.5 — Audit trail per edit (catalogEdits collection + History drawer)',
        description: story(
            'admin',
            'every catalog edit logged with who / when / what changed',
            'we can answer "why did this price change?" months later',
        ),
        acceptanceCriteria: [
            'New top-level catalogEdits/{id} collection: { docPath, field, prevValue, newValue, actorId, actorName, ts }',
            'Every inline-edit save also writes a catalogEdit doc',
            '"History" button on each row opens a drawer showing edits chronologically',
            'Filterable by actor + date range',
            'Foundation for the Epic 5 Activity Log story',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8.5', points: 2, epicId: 'data-management',
    },
    {
        title: '3.8.6 — Column-header help text + tooltips (specs domain knowledge)',
        description: story(
            'admin',
            'tooltips on every column header that explain the field\'s meaning and units',
            'a new admin doesn\'t have to ask me whether "dry weight" means rigged or unrigged',
        ),
        acceptanceCriteria: [
            'Tooltip on each column header showing: field name, units, what it drives in the system, example value',
            'Content authored against the specs domain glossary',
            'Links to the relevant section of admin docs where present',
        ],
        type: 'content', priority: 'low', targetRelease: 'v1.8.5', points: 1, epicId: 'data-management',
    },
    {
        title: '3.8.8 — Catalog data export (CSV / XLSX) per tab',
        description: story(
            'admin',
            'a download button on each catalog tab that exports every visible row + column as CSV or XLSX',
            'I can take catalog data into Excel for analysis, share with vendors, or edit-and-re-import without an inflexible wizard',
        ),
        acceptanceCriteria: [
            '"Export" button on each tab; choice of CSV or XLSX',
            'Exports every visible column (respects filter + saved view)',
            'Round-trips with the import format — re-importing the export upserts cleanly via natural key (v1.4 lesson)',
            'Filename pattern: <tab>-<vendorOrAll>-<YYYYMMDD>.<csv|xlsx>',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8.5', points: 2, epicId: 'data-management',
    },
    {
        title: '3.8.9 — Pre-commit diff preview on imports (was 3.11.2, pulled forward)',
        description: story(
            'admin',
            'the importer to show me which rows will create / update / skip BEFORE I commit',
            'I never commit a bad import that overwrites operator edits or creates duplicates',
        ),
        acceptanceCriteria: [
            'Upload spreadsheet → diff view (3 sections: will-create, will-update with field deltas, will-skip with reason)',
            'Per-row tick to opt out of any change',
            'Commit button writes only the ticked changes',
            'Diff cached until user navigates away or commits',
        ],
        type: 'improvement', priority: 'high', targetRelease: 'v1.8.5', points: 3, epicId: 'data-management',
    },
    {
        title: '3.8.7 — Decommission Pricing Manager + HighfieldModelEditor',
        description: story(
            'product owner',
            'the legacy Pricing Manager and HighfieldModelEditor pages retired in favour of /catalog-manager',
            'admins have one place to edit catalog data and we don\'t carry duplicate UI surfaces',
        ),
        acceptanceCriteria: [
            '🚦 GATE: 3.7.5 Pricing Manager feature parity audit complete with no "unknown" rows',
            '🚦 GATE: 3.7.8 Delivered deals + stock placement decision recorded',
            'Every legacy capability either has a Catalog Manager equivalent shipped, OR a future story explicitly tracking it',
            '/pricing-manager redirects to /catalog-manager?tab=boats',
            'Per-model editor entry on module pages redirects to the matching row in /catalog-manager (anchor-scrolled into view)',
            'Dead components removed from the bundle (HighfieldModelEditor, MotorModelEditor, TrailerModelEditor pages)',
            'Sidebar Pricing Manager entry replaced by Catalog Manager entry (handled by 3.7.1)',
            'No regression on existing flows that call into model fields directly (quote flow, proposals, finalize, PDF render)',
            'Quote-flow regression test passes end-to-end on a Highfield boat with multiple variants + accessories',
        ],
        type: 'improvement', priority: 'medium', targetRelease: 'v1.8.5', points: 3, epicId: 'data-management',
    },

    // ─── Phase C — Compatibility + options (v2.0, 9 pts) ──────────────────
    {
        title: '3.9.1 — Optional features editor (drill-down panel per model)',
        description: story(
            'admin',
            'a focused panel to add / edit / remove optional features on a model, with applicableVariantIds restrictions',
            'I can manage the manufacturer-options catalog from the same surface as everything else',
        ),
        acceptanceCriteria: [
            '"Optional features" button on each Boats row opens a drill-down panel',
            'Add / edit / delete features: name, code, sell price, cost, applicableVariantIds (multi-select of SKUs)',
            'Replaces the optional-features tab buried in HighfieldModelEditor',
            'Quote flow continues to read these features with no migration required',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v2.0', points: 3, epicId: 'data-management',
    },
    {
        title: '3.9.2 — Motor compatibility window editor (min HP / max HP per boat model)',
        description: story(
            'admin',
            'to set the min/max HP window per boat model in one place',
            'the motor picker correctly filters incompatible motors out of the customer-facing flow',
        ),
        acceptanceCriteria: [
            'Min HP + Max HP fields on each Boats row',
            'Writes to specifications.motorConfigurations[0].engines[0].minHp/maxHp',
            'Validation: min ≤ max; both > 0',
            'Motor picker in the quote flow reads these values directly (no other change required)',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.0', points: 2, epicId: 'data-management',
    },
    {
        title: '3.9.3 — Dealer fit compat editor (boat ↔ dealer-fit-category checklist)',
        description: story(
            'admin',
            'to edit which dealer fit categories apply to each boat',
            'the dealer-fit picker in the quote flow shows the right categories per hull',
        ),
        acceptanceCriteria: [
            '"Dealer fit categories" button on each Boats row opens a multi-select checklist',
            'Reads + writes to modules/{moduleId}.moduleDealerFitCategories[] — bound by selected vendor',
            'Persists per-module so the same boat shows different fit options under different modules',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.0', points: 2, epicId: 'data-management',
    },
    {
        title: '3.9.4 — Trailer compat editor (boat ↔ trailer matrix)',
        description: story(
            'admin',
            'a matrix view where I can see and edit which trailers fit which hulls',
            'trailer recommendations in the quote flow are correct without per-model trial and error',
        ),
        acceptanceCriteria: [
            'Tab in /catalog-manager (or modal from a Boats row): boat × trailer compatibility grid',
            'Per cell: compatible Y/N + optional notes (e.g. "12-month rego only")',
            'Persists to a new compat doc structure or a trailerCompat field on each model',
            'Quote-flow trailer picker reads this matrix instead of guessing from spec dimensions',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.0', points: 2, epicId: 'data-management',
    },
    {
        title: '3.9.5 — Per-org vendor exchange rate editor',
        description: story(
            'admin',
            'an editor for the org-level vendor exchange rates (e.g. USD vendor → AUD sell)',
            'I can adjust currency conversions in one place when a vendor changes terms or the rate moves materially',
        ),
        acceptanceCriteria: [
            '"Exchange rates" section visible from Catalog Manager (per vendor with non-AUD currency)',
            'Reads + writes to organisations/{orgId}/exchangeRates/{currencyCode}',
            'Shows current rate + last-updated date + actor',
            'Pricing recalcs in the catalog tables reflect the new rate immediately',
            'Audit trail (3.8.5) captures every rate change',
        ],
        type: 'feature', priority: 'medium', targetRelease: 'v2.0', points: 2, epicId: 'data-management',
    },

    // ─── Phase D — Bulk operations (Unscheduled, 11 pts) ──────────────────
    {
        title: '3.10.1 — Multi-row select + bulk price adjustment',
        description: story(
            'admin',
            'to select 50 motors, apply a 4 % markup, and save them in one action',
            'price-list updates take seconds, not an hour of cell-by-cell editing',
        ),
        acceptanceCriteria: [
            'Checkbox column on every table; select all / select filtered',
            'Bulk-action toolbar: apply % markup, copy from price level, find/replace',
            'Preview diff before commit',
            'Each affected row writes a catalogEdit doc (audit)',
        ],
        type: 'feature', priority: 'low', targetRelease: 'Unscheduled', points: 3, epicId: 'data-management',
    },
    {
        title: '3.10.2 — Paste-from-spreadsheet upload (CSV/TSV → preview diff → upsert)',
        description: story(
            'admin',
            'to paste a spreadsheet column directly into the table',
            'I can update prices in Excel / Sheets where I already have the data, without an importer',
        ),
        acceptanceCriteria: [
            'Paste detection on the table; shows mapping wizard',
            'Upsert by natural key per the v1.4 import lesson (Part Number / Model Code / SKU)',
            'Diff preview: N updated · M created · K skipped',
            'Confirm to commit; each row writes catalogEdit',
        ],
        type: 'feature', priority: 'low', targetRelease: 'Unscheduled', points: 3, epicId: 'data-management',
    },
    {
        title: '3.10.3 — Cross-tab filter + search bar',
        description: story(
            'admin',
            'a search bar at the top of the catalog manager that searches across boats / motors / trailers',
            'finding a specific item by name or part number is instant',
        ),
        acceptanceCriteria: [
            'Top-of-page search; searches title / code / part number / SKU',
            'Results grouped by tab (Boats / Motors / Trailers) with click-through',
            'Cmd+K keyboard shortcut',
            'Pairs with v1.7.5 1.7.4 Global Search (orthogonal but consistent)',
        ],
        type: 'feature', priority: 'low', targetRelease: 'Unscheduled', points: 2, epicId: 'data-management',
    },
    {
        title: '3.10.4 — Saved filter views per user',
        description: story(
            'admin',
            'to save a frequent filter combo as a named view ("Highfield Sport low-margin")',
            'I can jump back to a working view in one click instead of re-applying filters',
        ),
        acceptanceCriteria: [
            'Save current filter state as a named view (per-user)',
            'View dropdown surfaces all saved views',
            'Default view per user (last-used or pinned)',
            'View persists in users/{uid}/catalogManagerViews',
        ],
        type: 'feature', priority: 'nice-to-have', targetRelease: 'Unscheduled', points: 3, epicId: 'data-management',
    },

    // ─── Phase E — Import surface deep work (Unscheduled, 5 pts) ─────────
    // (3.11.1 + 3.11.2 pulled forward to Phase A + Phase B so the
    // Catalog Manager ships with full Pricing Manager parity.)
    {
        title: '3.11.3 — Per-vendor importer plug-in registry',
        description: story(
            'developer',
            'a registry where adding a new vendor importer is a 1-file change',
            'we can onboard a new vendor without rewriting import infrastructure',
        ),
        acceptanceCriteria: [
            'Importers register a config: { id, label, type (boat/motor/trailer), parseFn, keyColumn, mappingFn }',
            'Catalog Manager UI auto-lists every registered importer for the relevant tab',
            'Existing importers (Yamaha MPF, Sam Allen, Trailer pricing) refactored to register through this',
            'Documented pattern in CLAUDE.md or tasks/',
        ],
        type: 'feature', priority: 'low', targetRelease: 'Unscheduled', points: 5, epicId: 'data-management',
    },

    // ─── Epic 6 — Launch Prep & Ops companion tasks ──────────────────────
    {
        title: 'Catalog data backfill — sweep models for missing required cols',
        description: activity(
            'Walk every boat / motor / trailer model in the catalog. For each, check the required columns surfaced by the Master Catalog Manager (HP range, capacity, dimensions, weight, base price, cover image). Anything missing = fill or note as TBD. Drives the red-highlight visual cleanup goal of 3.7.2 / 3.7.4.',
        ),
        acceptanceCriteria: [
            'Audit complete across every catalog item',
            'Missing-data list compiled and assigned to owners',
            'Backfill complete OR flagged TBD with owner + ETA',
            'Catalog Manager loads with no red-highlighted rows',
        ],
        type: 'task', priority: 'high', targetRelease: 'v1.8', points: null, epicId: 'launch-prep-ops',
    },
    {
        title: 'Catalog Manager admin training session',
        description: activity(
            'Train the admin team on the new /catalog-manager workflow once Phase B (inline editing + audit) ships. Cover: tab navigation, inline edit mechanics, undo via History drawer, image swap, when to use bulk ops vs row-by-row.',
        ),
        acceptanceCriteria: [
            'Training booked post-v1.8.5 deploy',
            'Materials: cheat sheet + 5-minute screen recording',
            'Admin team trained',
            'Feedback captured and triaged into follow-up stories',
        ],
        type: 'task', priority: 'medium', targetRelease: 'v1.9', points: null, epicId: 'launch-prep-ops',
    },
];

export interface CatalogManagerSeedSummary {
    featuresCreated: number;
    featuresSkipped: number;
}

/**
 * Seed the 22 Catalog Manager + Ops backlog items. Idempotent — re-running
 * skips entries whose titles already exist.
 *
 * Stories ship in `status: 'submitted'` (proposed scope, not accepted).
 * The product owner accepts each one through the standard Accept button
 * as they review. No auto-accept.
 */
export async function seedCatalogManagerBacklog(
    firestore: Firestore,
    submitterUid: string,
    submitterName: string,
): Promise<CatalogManagerSeedSummary> {
    let featuresCreated = 0;
    let featuresSkipped = 0;

    // Dedupe by title.
    const existing = await getDocs(collection(firestore, 'features'));
    const existingTitles = new Set<string>();
    existing.forEach(d => {
        const t = (d.data().title as string | undefined)?.trim();
        if (t) existingTitles.add(t);
    });

    for (const f of FEATURES) {
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

    return { featuresCreated, featuresSkipped };
}
