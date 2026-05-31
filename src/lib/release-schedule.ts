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
 * Programmatically populate the v1.10 → v1.99 release window.
 * No artificial gap to v2.0 — bands pack into v1.X sequentially until
 * we actually reach v2.0 organically. v2.x kept for the MVP marker
 * + post-MVP polish slots, NOT auto-populated by the restructure bands.
 */
function buildV1MinorReleases(): Record<string, ReleaseWindow> {
    const out: Record<string, ReleaseWindow> = {};
    for (let i = 10; i <= 99; i++) {
        out[`v1.${i}`] = {};
    }
    return out;
}

export const RELEASE_WINDOWS: Record<string, ReleaseWindow> = {
    'v1.6':   { shipped: true },
    'v1.7':   { shipped: true },
    'v1.8':   { shipped: true },
    'v1.9':   { shipped: true },
    ...buildV1MinorReleases(),
    'v2.0':   { isMVP: true },
    'v2.1':   {},
    'v2.2':   {},
    'v2.3':   {},
    'v2.4':   {},
    'v2.5':   {},
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
