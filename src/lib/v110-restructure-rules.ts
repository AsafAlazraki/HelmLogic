/**
 * v1.10 restructure — categorisation + target-release suggestion rules
 * (v1.10 cycle, one-shot, removed after Apply).
 *
 * Encodes the title-prefix → category mapping derived from the v1.9
 * Roadmap screenshot walkthrough:
 *
 *   1.x  Sales / Quote / PDF authoring  → customer-facing
 *   2.x  Contract / payment workflow    → customer-facing
 *   3.x  Master Catalog Manager (Data)  → dealer-ops:parts-pricing
 *   4.x  (unknown — treat as cust)      → customer-facing
 *   5.x  (Security / cust-relationship) → customer-facing
 *   6.x  Ops (Catalog ops, dep tooling) → dealer-ops:parts-pricing
 *        EXCEPT 6.4.x (dep validation)  → cross-cutting
 *   7.x  Platform                       → cross-cutting
 *   8.x  Sales Ops workspace            → customer-facing
 *   9.x  Fit-Up & Production            → dealer-ops:fit-up
 *   10.x Notifications & Alerts        → customer-facing:notifications
 *
 * Stakeholders' priority (May 2026 meetings):
 *   - Dealer-ops UP   → suggest pull to v1.10-v1.14
 *   - Customer-facing DOWN → suggest push to v1.18+
 *   - Notifications DOWN further → suggest v1.22+ (last)
 *   - Cross-cutting + shipped/unknown → leave alone
 *
 * The user can override any per-story suggestion in the Workbench UI;
 * these rules just seed the proposal.
 */

export type Category =
    | 'dealer-ops:fit-up'
    | 'dealer-ops:parts-pricing'
    | 'dealer-ops:guided-config'
    | 'dealer-ops:module'
    | 'customer-facing'
    | 'customer-facing:notifications'
    | 'cross-cutting'
    | 'discard';

export const CATEGORY_LABEL: Record<Category, string> = {
    'dealer-ops:fit-up':           'Dealer-ops · Fit-up',
    'dealer-ops:parts-pricing':    'Dealer-ops · Parts/Pricing',
    'dealer-ops:guided-config':    'Dealer-ops · Guided Config',
    'dealer-ops:module':           'Dealer-ops · Module',
    'customer-facing':             'Customer-facing',
    'customer-facing:notifications': 'Customer-facing · Notifications',
    'cross-cutting':               'Cross-cutting',
    'discard':                     'Discard (stale)',
};

export const CATEGORY_TINT: Record<Category, string> = {
    'dealer-ops:fit-up':           'bg-rose-50 text-rose-700 border-rose-200',
    'dealer-ops:parts-pricing':    'bg-amber-50 text-amber-700 border-amber-200',
    'dealer-ops:guided-config':    'bg-blue-50 text-blue-700 border-blue-200',
    'dealer-ops:module':           'bg-indigo-50 text-indigo-700 border-indigo-200',
    'customer-facing':             'bg-slate-50 text-slate-600 border-slate-200',
    'customer-facing:notifications': 'bg-cyan-50 text-cyan-700 border-cyan-200',
    'cross-cutting':               'bg-violet-50 text-violet-700 border-violet-200',
    'discard':                     'bg-rose-100 text-rose-800 border-rose-300',
};

/** Pull the leading numeric prefix from a title like "1.4.5 — Quote Versioning...". */
function leadingPrefix(title: string): string {
    const m = title.trim().match(/^(\d+(?:\.\d+){0,3})/);
    return m ? m[1] : '';
}

export function inferCategory(title: string): Category {
    const p = leadingPrefix(title);
    if (!p) return 'cross-cutting';

    if (p.startsWith('9.')) return 'dealer-ops:fit-up';
    if (p.startsWith('3.')) return 'dealer-ops:parts-pricing';
    if (p.startsWith('6.4.')) return 'cross-cutting'; // dep-validation tooling
    if (p.startsWith('6.')) return 'dealer-ops:parts-pricing'; // Ops / catalog ops
    if (p.startsWith('10.')) return 'customer-facing:notifications';
    if (p.startsWith('7.')) return 'cross-cutting'; // Platform
    if (p.startsWith('5.')) return 'cross-cutting'; // Security (rule: treat as cross-cutting; user overrides if needed)
    if (p.startsWith('1.') || p.startsWith('2.') || p.startsWith('4.') || p.startsWith('8.')) return 'customer-facing';

    return 'cross-cutting';
}

/** Releases that have already shipped — never propose moves on these. */
const SHIPPED_RELEASES: Set<string> = new Set([
    'v1.0', 'v1.1', 'v1.2', 'v1.2.1', 'v1.3', 'v1.3.1',
    'v1.4', 'v1.5', 'v1.5.1',
    'v1.6', 'v1.6.1', 'v1.6.2',
    'v1.7', 'v1.7.5',
    'v1.8', 'v1.8.5',
    'v1.9', 'v1.9.5',
]);

export function isShippedRelease(release: string | null | undefined): boolean {
    return release ? SHIPPED_RELEASES.has(release) : false;
}

/**
 * Suggest a new target release based on category + current target.
 *
 * Handles BOTH scheduled features (current = "v1.X") and Backlog /
 * unscheduled features (current = null / undefined — Submitted-column
 * inflow with no release yet).
 *
 * Heuristic (NOT capacity-aware — the Workbench shows running totals so
 * the user can re-balance any cell that goes red):
 *
 *   shipped releases             → no move
 *   dealer-ops in v1.10-v1.14    → no move (already prioritised)
 *   dealer-ops elsewhere or null → suggest v1.10
 *   notifications (any target)   → suggest v1.22 (push to last)
 *   customer-facing in v1.18+    → no move
 *   customer-facing < v1.18 or null → suggest v1.18
 *   cross-cutting on a release   → no move
 *   cross-cutting unscheduled    → suggest v1.20 (operator can override)
 *   discard                      → no move (caller soft-deletes)
 */
export function suggestTargetRelease(
    currentRelease: string | null | undefined,
    category: Category,
): string | null {
    // Shipped: never propose a move
    if (currentRelease && isShippedRelease(currentRelease)) return currentRelease;

    // Discard: caller handles via soft-delete, not retarget
    if (category === 'discard') return currentRelease ?? null;

    if (category.startsWith('dealer-ops')) {
        if (currentRelease && isInRange(currentRelease, ['v1.10', 'v1.11', 'v1.12', 'v1.13', 'v1.14'])) {
            return currentRelease;
        }
        return 'v1.10';
    }

    if (category === 'customer-facing:notifications') {
        return 'v1.22';
    }

    if (category === 'customer-facing') {
        if (currentRelease) {
            const num = parseV1MinorNumber(currentRelease);
            if (num !== null && num >= 18) return currentRelease;
        }
        return 'v1.18';
    }

    // cross-cutting:
    //   - if already on a release, leave it
    //   - if unscheduled, slot at v1.20 (polish bucket) so it doesn't
    //     stay invisible in the Submitted column. Operator overrides
    //     if a different release fits better.
    if (currentRelease) return currentRelease;
    return 'v1.20';
}

function isInRange(release: string, range: string[]): boolean {
    return range.includes(release);
}

function parseV1MinorNumber(release: string): number | null {
    const m = release.match(/^v1\.(\d+)/);
    if (!m) return null;
    return parseInt(m[1], 10);
}

/** All releases the Workbench supports as target-release options. */
export const TARGETABLE_RELEASES: string[] = [
    'v1.10', 'v1.11', 'v1.12', 'v1.13', 'v1.14',
    'v1.15', 'v1.16', 'v1.17', 'v1.18', 'v1.19',
    'v1.20', 'v1.21', 'v1.22', 'v1.23', 'v1.24',
    'v2.0', 'v2.1', 'v2.2',
];

/** Standard per-release point cap (matches release-schedule.ts thresholds). */
export const POINTS_CAP_GREEN = 16;
export const POINTS_CAP_RED = 21;

export function capacityTint(points: number): 'green' | 'amber' | 'red' {
    if (points >= POINTS_CAP_RED) return 'red';
    if (points >= POINTS_CAP_GREEN) return 'amber';
    return 'green';
}
