/**
 * Release schedule (v1.6+).
 *
 * Single source of truth for the planned release windows that drive
 * the Roadmap view's "Today" pill, "SCIBS" pill, column ordering, and
 * over-load colour-coding (points-per-release).
 *
 * Update this file when the plan shifts. Do NOT compute dates from
 * heuristics — explicit windows are easier to reason about and keep
 * in sync with the spreadsheet plan.
 */

export interface ReleaseWindow {
    /** ISO yyyy-mm-dd, inclusive. */
    start: string;
    /** ISO yyyy-mm-dd, inclusive. */
    end: string;
    /** Marks the SCIBS-ready release. Renders the SCIBS pill in the column header. */
    isMVP?: boolean;
    /** Optional human label (e.g. "Apr 27 → Apr 30"). */
    label?: string;
}

/** Ordered map (insertion order = column order on the Roadmap). */
export const RELEASE_WINDOWS: Record<string, ReleaseWindow> = {
    'v1.6': { start: '2026-04-27', end: '2026-04-30', label: 'Apr 27 → Apr 30' },
    'v1.7': { start: '2026-05-01', end: '2026-05-06', label: 'May 1 → May 6' },
    'v1.8': { start: '2026-05-07', end: '2026-05-11', label: 'May 7 → May 11' },
    'v1.9': { start: '2026-05-12', end: '2026-05-15', label: 'May 12 → May 15' },
    'v2.0': { start: '2026-05-16', end: '2026-05-19', label: 'May 16 → May 19', isMVP: true },
};

/** Pseudo-release for features with targetRelease = null. Always rendered last. */
export const UNSCHEDULED_KEY = 'Unscheduled';

/** Ordered column keys for the Roadmap (real releases + Unscheduled). */
export const ROADMAP_COLUMNS = [...Object.keys(RELEASE_WINDOWS), UNSCHEDULED_KEY] as const;

/**
 * Returns the release key whose window contains today's date, or null
 * if today is before/after the planned schedule. Used to render the
 * "Today" pill on the active column.
 */
export function getActiveReleaseKey(now: Date = new Date()): string | null {
    const today = now.toISOString().slice(0, 10);
    for (const [key, win] of Object.entries(RELEASE_WINDOWS)) {
        if (today >= win.start && today <= win.end) return key;
    }
    return null;
}

/** Returns true if the release is the SCIBS-flagged MVP target. */
export function isMVPRelease(releaseKey: string): boolean {
    return RELEASE_WINDOWS[releaseKey]?.isMVP === true;
}

/** Threshold above which a column header tints amber (warning). */
export const POINTS_AMBER = 25;
/** Threshold above which a column header tints red (likely impossible). */
export const POINTS_RED = 40;
