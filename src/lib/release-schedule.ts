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
 * Loop START INDEX: starts at v1.12, NOT v1.11. Once a release ships
 * (gets its own explicit `'vX.Y': { shipped: true }` entry above the
 * spread), it must be EXCLUDED from this generator — otherwise the
 * spread's empty `{}` would clobber the shipped flag. When v1.12 ships,
 * bump this constant to 13. (v1.10 close-out post-mortem: I shipped
 * v1.10 with the start index still at 10, the spread silently
 * overwrote `{shipped: true}` to `{}`, the SHIPPED pill never rendered
 * on the Roadmap — caught by the user "why isn't 1.10 green?")
 */
const FORWARD_RUNWAY_START = 12;
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
