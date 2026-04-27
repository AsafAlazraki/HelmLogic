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
}

/**
 * Ordered map (insertion order = column order on the Roadmap).
 *
 * Intermediate "half" releases (v1.7.5, v1.8.5, v1.9.5) exist so we
 * can split work into ~25-40 pt buckets without forcing one giant
 * release. Each release is themed; "half" releases extend the same
 * theme rather than picking it up after a context switch.
 */
export const RELEASE_WINDOWS: Record<string, ReleaseWindow> = {
    'v1.6':   {},
    'v1.7':   {},
    'v1.7.5': {},
    'v1.8':   {},
    'v1.8.5': {},
    'v1.9':   {},
    'v1.9.5': {},
    'v2.0':   { isMVP: true },
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

/** Threshold above which a column header tints amber (warning). */
export const POINTS_AMBER = 35;
/** Threshold above which a column header tints red (over capacity). */
export const POINTS_RED = 50;
