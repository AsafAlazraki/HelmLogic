/**
 * Release schedule (v1.6+).
 *
 * Single source of truth for the release columns on the Roadmap.
 * Dates intentionally absent — Mark's feedback was that visible date
 * labels implied a fixed timeline / boat-show commitment we don't
 * want to make. Releases are aspirational, not promises.
 */

export interface ReleaseWindow {
    /** Marks an internal MVP target. NOT rendered visually anywhere. */
    isMVP?: boolean;
    /**
     * Marks a release that has shipped to production. Drives the emerald
     * "Shipped" header pill on the Roadmap, the emerald release-pill on
     * the Backlog, and locks edits on stories targeted at this release
     * (status / release / epic / points / title / description all become
     * read-only — comments still post). Flip this flag when the
     * dev → main PR for the release is merged.
     */
    shipped?: boolean;
}

/**
 * Ordered map (insertion order = column order on the Roadmap).
 *
 * Sequential minor versioning (v1.7, v1.8, v1.9, v1.10, v1.11, ...).
 * 20-pt cap per release — see POINTS_AMBER / POINTS_RED below. The
 * earlier ".5" pattern (v1.7.5, v1.8.5) is preserved for the already-
 * shipped releases (v1.5.1, v1.6.1) that used it; new releases just
 * increment the minor.
 */
/**
 * Forward release runway. Sequential v1.X minor versions — NO artificial
 * jump to v2.0. We increment v1.10 → v1.11 → … and only reach v2.0 once
 * the v1.X runway is genuinely full ("go to 2 only when we get there").
 *
 * Bounded at v1.40 so the Roadmap renders a sane number of columns (the
 * restructure packs ~25 releases of work; v1.40 gives comfortable buffer
 * without 90 empty columns). v2.x is intentionally NOT a column yet — it
 * gets added when the v1.X runway is nearly exhausted.
 *
 * Loop START INDEX: starts at v1.14, NOT v1.13. Once a release ships
 * (gets its own explicit `'vX.Y': { shipped: true }` entry above the
 * spread), it must be EXCLUDED from this generator — otherwise the
 * spread's empty `{}` would clobber the shipped flag. When v1.14 ships,
 * bump this constant to 15. (v1.10 close-out post-mortem: I shipped
 * v1.10 with the start index still at 10, the spread silently
 * overwrote `{shipped: true}` to `{}`, the SHIPPED pill never rendered
 * on the Roadmap — caught by the user "why isn't 1.10 green?")
 */
const FORWARD_RUNWAY_START = 24;
const FORWARD_RUNWAY_END = 40;
function buildV1MinorReleases(): Record<string, ReleaseWindow> {
    const out: Record<string, ReleaseWindow> = {};
    for (let i = FORWARD_RUNWAY_START; i <= FORWARD_RUNWAY_END; i++) {
        out[`v1.${i}`] = {};
    }
    return out;
}

export const RELEASE_WINDOWS: Record<string, ReleaseWindow> = {
    'v1.6':   { shipped: true },
    'v1.7':   { shipped: true },
    'v1.8':   { shipped: true },
    'v1.9':   { shipped: true },
    // v1.9.5 — planning + groundwork release: roadmap reshuffle (dealer-ops
    // pivot + Submitted-column drain + capacity bin-packing), Epic 11
    // Service Quoting groundwork (NSM-Hub absorption, planned not built),
    // clickable release-detail popups, + emailTemplates rules re-deploy.
    // Fractional, like v1.5.1 / v1.6.1. The actual v1.10 BUILD comes next.
    'v1.9.5': { shipped: true },
    // v1.10 — Dealer-ops + Service Quoting foundation cycle. Three
    // phases: (A) prod-bug pass (cover letter, dealer-fit names,
    // locked-discount, stock-import race); (B) Fit-Up admin (full
    // Epic 9.1.x — schema, CRUD, CSV in/out, bulk markup); (C) Service
    // Quoting catalogue (Epic 11.1.1 + 11.1.2 — serviceOperations +
    // serviceParts collections + admin UI). Plus Story 3.7.2 Boats
    // Catalogue read-view. NOT in v1.10: Epic 9.2 quote-flow fit-up
    // integration (v1.16+), Epic 11.2 service-quote flow (v1.11+),
    // Epic 11.3 NSM-Hub migration (v1.11, needs service-account).
    'v1.10': { shipped: true },
    // v1.11 — Fit-Up release. Phase A (end-to-end quote-flow integration
    // pulled from v1.16: Epic 9.2.1 / 9.2.2 / 9.2.3 + simplified 9.3.1)
    // plus Phase B (expansion: categories, customerDescription, packages,
    // search, per-line qty/override/note, workshop status). Non-fit-up
    // stories built in the same dev cycle (Service Quote Flow, Motors
    // Table, Suggestion Approval Queue) were retargeted to v1.12 so v1.11
    // ships as a focused Fit-Up release.
    'v1.11': { shipped: true },
    // v1.12 — Service Quoting end-to-end. 11.2.2 view/edit/status
    // lifecycle, 11.2.3 service-quote PDF (HL @react-pdf), 3.4.1 customer
    // schema redesign (source / lifecycleStage / primary+secondary buyer /
    // tradeIn ref / documents / notesCount). NOT in v1.12: 11.3.2
    // migration tooling — blocked on NSM-Hub service-account; lands when
    // access clears (v1.14+).
    'v1.12': { shipped: true },
    // v1.13 — Service Quoting send + Catalog admin polish. 11.2.4
    // send-service-quote-via-email (reuses v1.8 send pipeline), 3.7.4
    // Trailers table read-view (per-state rego cost surfaced), 3.7.5
    // Pricing Manager feature parity audit, 3.8.1 inline edit pricing
    // fields, 3.8.2 inline edit spec fields. NOT in v1.13: 11.3.3 NSM-Hub
    // cutover — still blocked on service-account.
    'v1.13': { shipped: true },
    // v1.14 — Catalogue polish round. 3.8.1 + 3.8.2 retrofit (Motors Table
    // gains inline editing on Name / HP / Shaft / Cost / Sell); 3.8.6
    // column-header help tooltips on Motors + Trailers tables; 3.8.8
    // per-tab CSV export on Motors + Trailers; 9.2.3 customer PDF fit-up
    // summary line (already shipped in v1.11 code — status flipped only).
    // NOT in v1.14: 11.3.2 + 11.3.3 NSM-Hub (still blocked); 9.2.1
    // per-module Fit-up tab (different from v1.11 Step-5 selector — needs
    // its own design pass); 3.7.6 org-level pricing overrides inline;
    // 3.7.7 per-vendor imports under catalog tabs; 3.9.1 optional features
    // drill-down editor — all on the v1.15+ queue.
    'v1.14': { shipped: true },
    // v1.15 — Suggestion audit + Marketing copy + Rule engine. 3.3.1
    // crowdsourced suggestions with audit-log writes per approve/reject;
    // 3.4.2 marketing copy editor UI on BoatsTable; 9.3.1 rule-based
    // fit-up tier auto-classification (full rule engine — new
    // fitUpClassificationRules collection + admin UI + resolver, replaces
    // the v1.11 motor-HP heuristic).
    'v1.15': { shipped: true },
    // v1.16 — Wide polish + 34-ticket backlog drain. 21 code-shipped
    // (Hypalon label, inc-GST sub-line, no-trailer pill, trailer subtotal,
    // dealer-fit headings + expander + model-specific filter, archive
    // toggle on Recent Proposals, larger images + logos, Trailer Spec
    // pricing removed, Show/Hide option prices, improved Step header,
    // 3.8.3 cover image, 3.8.4 marketing rich editor, 3.9.2 motor compat,
    // 3.9.3 dealer-fit compat, 3.4.3 photo curation, 3.8.1 inventory
    // badge); 3 stale-flip (9.2.2 already shipped in v1.11 quote-flow,
    // VDUeX9zQ + e6twmpiT trailer/colour image in v1.11 Phase D);
    // 10 decisions/docs consolidated in tasks/v1.16-DECISIONS.md.
    // Plus PDF close-out polish: blank-page fix (absolute-positioned
    // fixed footer), Investment Summary tightening (~50% more rows per
    // page), smart-continue mode for content blocks (short atomic /
    // long flow). NOT in v1.16: 11.3.2 + 11.3.3 NSM-Hub work — still
    // service-account-blocked; deferred to v1.17.
    'v1.16': { shipped: true },
    // v1.17 — Catalog editing at scale + bug sweep. Phase A (7 stories,
    // all unblocked): 3.10.1 multi-row select + bulk markup on Motors +
    // Trailers, 3.10.2 paste-from-spreadsheet (auto-detected key column,
    // diff preview, idempotent merge), 3.10.3 cross-tab catalog filter
    // (search box on Catalog Manager threads through as initialSearch
    // to Motors/Trailers/Boats tables), 3.2.1 internal data normalisation
    // layer (derive-pricing.ts canonical shape + applyMarkup helper +
    // GST_MULTIPLIER constant + isRateStale detector), 3.11.3 per-vendor
    // importer plug-in registry (Yamaha MPF + Sam Allen + Trailer Brand
    // pre-registered), 3.9.4 boat <-> trailer compat editor, 3.9.5
    // exchange-rate stale-warning helper. Phase B bug sweep: 2 of 5
    // resolved (Trailer Catalog gap via 3.10.2 + 3.11.3, 3.7.8 placement
    // decision in tasks/v1.17-DECISIONS.md), 2 parked awaiting repro
    // (HL save error, RU200KAM $76.82 delta), 1 still service-account-
    // blocked (11.3.1 NSM customer reconciliation) carrying to v1.18.
    // NOT in v1.17: NSM-Hub migration (11.3.2 + 11.3.3, still blocked),
    // customer surfaces (Epic 8.1 v1.21+), quote variations (Epic 2.4
    // v1.18+), margin threshold (Epic 2.2 v1.19).
    'v1.17': { shipped: true },
    // v1.18 — Catalog polish + first customer-facing surface + Shopify
    // spike. Phase A (6 stories): 3.10.4 saved filter views per user
    // (stored on user profile doc, no new collection), 2.1.1 structured
    // price sources (canonical resolvePriceLevel + PRICE_FALLBACK_FIELDS
    // in derive-pricing.ts; motors + finalize migrated), Edit Stock Item
    // (inline edit on StockList rows for stockNumber / location / label),
    // Export Data brand -> range -> model (one-CSV hierarchy export for
    // boats), Receipt PDF branding (shared pdf-branding.ts tokens lib),
    // 1.4.2 Send Quote Action stale-flip (already shipped v1.8/1.2.4.c;
    // regression test added). Phase C: Shopify research spike, doc + code
    // stubs only (tasks/shopify-exploration-notes.md, src/lib/shopify/*).
    // Held / retargeted: 1.3.2 Contract Signing Pack v1.18 -> v1.20,
    // 2.3.1 Quote Variations v1.18 -> v1.19. NSM-Hub trio (11.3.1/.2/.3)
    // carries to v1.19, still service-account-blocked.
    'v1.18': { shipped: true },
    // v1.19 — Pricing discipline + variations foundation. Phase A
    // (3 code-shipped + 1 schema-only): 2.2.1 margin threshold
    // enforcement + GM override (margin-gate.ts + finalize gate +
    // override dialog), 2.1.2 model-specific fit-out pricing (3-tier
    // package prices + admin UI on HighfieldModelEditor), 2.3.1 quote
    // variations schema + helpers + Firestore rules + regression test
    // (UI v1.20), 2.6.3 customer agreement schema fields baked into
    // QuoteVariation (UI v1.20). New Firestore path: users/{uid}/
    // quotes/{qid}/variations/{vid}. Rules updated + regression test
    // extended. Retargeted out of v1.19: 8.2.1 Reporting Dashboard ->
    // v1.20. NSM-Hub trio (11.3.1/.2/.3) carries to v1.20, still
    // service-account-blocked. PUBLISH firestore.rules to prod before
    // announcing - new variations path is the gate.
    'v1.19': { shipped: true },
    // v1.20 — Quote-to-contract lifecycle + variation surfaces.
    // Phase A (6 shippable): 2.4.1 Convert Quote -> Contract (schema +
    // helpers + Convert button + dialog + contract detail sheet),
    // 2.4.2 Deposit Recording with Receipt PDF foundation
    // (RecordDepositDialog, deposits list in the detail sheet),
    // 1.4.4 Quote Validity / Expiry (banner + Send/Convert gates),
    // 1.3.2 Contract Signing Pack PDF (first multi-document PDF
    // consuming pdf-branding.ts shared tokens), 2.3.1 Quote
    // Variations editor (mounts on locked quotes; schema v1.19),
    // 2.6.3 Customer Agreement on Variation public accept page at
    // /accept-variation/[token] with canvas signature + token lookup
    // via collectionGroup + anonymous auth (server-side endpoint v1.21
    // hardening). New Firestore paths: users/{uid}/quotes/{qid}/
    // contracts/{cid} + nested /deposits/{depositId}. Rules updated +
    // regression test extended. Retargeted out of v1.20: 8.2.1
    // Reporting Dashboard -> v1.21, 5.2.1 RBAC -> v1.22. NSM-Hub
    // trio carries to v1.21, still service-account-blocked. PUBLISH
    // firestore.rules to prod before announcing - new contracts +
    // deposits paths are the gate.
    'v1.20': { shipped: true },
    // v1.21 — Customer CRM foundation. 8.1.2 Customer Detail Sheet
    // (new /customers page mounts CustomerList + clickable detail sheet),
    // 8.2.1 Reporting Dashboard + 8.1.4 cross-module quotes view (metrics
    // strip + sortable/filterable collectionGroup quote list on
    // /reporting), plus lifecycle foundation libs 1.4.3 acceptance,
    // 1.5.5 trade-in, 2.5.3 inventory-allocation. E2E browser-tested on
    // dev (5/5) + 27/27 file ticks. NEW recursive Firestore rule
    // /{path=**}/quotes/{quoteId} for collectionGroup reads — PUBLISH to
    // prod before announcing. NSM-Hub trio stays blocked. NOT faked.
    'v1.21': { shipped: true },
    // v1.22 — Sales workspace shell. 8.1.1 Sales nav group (Customers/
    // Contracts/Reporting), 8.1.5 cross-module Contracts view
    // (/contracts), 2.7.1 margin-threshold config UI on /manage, 1.7.3
    // recent activity feed on /reporting, + libs 4.1.1 promotions,
    // 2.6.1 variation-order doc, 1.8.3 content-block layout toggle.
    // E2E 5/5 + 30/30 file. NEW recursive rules for contracts + auditLog
    // collectionGroup reads — publish before announcing. NSM-Hub blocked.
    'v1.22': { shipped: true },
    // v1.23 — Pipeline + payments + my-work. 1.7.1 sales pipeline board
    // (/pipeline, customers grouped by lifecycle stage), 2.4.3 payment
    // schedule (per-contract, in the contract detail sheet), 8.1.6 My
    // Work (/my-work, 3 tabs scoped to createdByUid). E2E 3/3 + 19/19
    // file. NSM-Hub blocked.
    'v1.23': { shipped: true },
    ...buildV1MinorReleases(),
};

/** Pseudo-release for features with targetRelease = null. Always rendered last. */
export const UNSCHEDULED_KEY = 'Unscheduled';

/** Ordered column keys for the Roadmap (real releases + Unscheduled). */
export const ROADMAP_COLUMNS = [...Object.keys(RELEASE_WINDOWS), UNSCHEDULED_KEY] as const;

/**
 * Always returns null now — kept for callers that haven't been
 * removed. Today-pill rendering on the Roadmap is dormant; if we
 * ever want it back we'll add explicit start/end here without
 * showing a label string.
 */
export function getActiveReleaseKey(_now: Date = new Date()): string | null {
    return null;
}

/** Returns true if the release is the internal MVP-target flag. */
export function isMVPRelease(releaseKey: string): boolean {
    return RELEASE_WINDOWS[releaseKey]?.isMVP === true;
}

/**
 * Returns true if the release has been shipped to production.
 * Use this to drive read-only UX on stories + emerald visuals on
 * release headers / chips. `null` / unknown release keys = false.
 */
export function isReleaseShipped(releaseKey: string | null | undefined): boolean {
    if (!releaseKey) return false;
    return RELEASE_WINDOWS[releaseKey]?.shipped === true;
}

/** Threshold above which a column header tints amber (warning). 20-pt cap, amber at 80% (16). */
export const POINTS_AMBER = 16;
/** Threshold above which a column header tints red (over capacity). Red AT 21 (over the 20-pt cap). */
export const POINTS_RED = 21;
