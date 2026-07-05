/**
 * margin-gate.ts (v1.19 — Story 2.2.1).
 *
 * Single source of truth for the "is this quote below the org's margin
 * threshold and does the operator have permission to override" check.
 * Consumed at finalize time by finalize-quote-dialog.tsx and surfaced
 * live in the quote-flow margin widget so the salesperson knows where
 * they stand before they hit Finalize.
 *
 * Org config: organisation.marginThresholdPct (number, default 15).
 * Permission: organisation.permissions[roleId].can_override_margin
 * (boolean, defaults false; the toggle is wired in
 * manage-organisation-page.tsx).
 *
 * Output bands:
 *   'pass'      — marginPct >= threshold
 *   'warn'      — marginPct within 5pts above threshold (visual nudge only)
 *   'fail'      — marginPct < threshold (gate engages)
 *
 * fail + !hasOverridePermission => finalize blocked.
 * fail + hasOverridePermission  => override dialog prompts for reason,
 *                                  writes auditLog 'margin-override' event.
 */

export const DEFAULT_MARGIN_THRESHOLD_PCT = 15;

export interface MarginGateInput {
    marginPct: number;
    marginThresholdPct?: number | null;
    hasOverridePermission?: boolean;
}

export interface MarginGateResult {
    marginPct: number;
    threshold: number;
    status: 'pass' | 'warn' | 'fail';
    requiresOverride: boolean;
    canProceed: boolean;
}

export function evaluateMarginGate(input: MarginGateInput): MarginGateResult {
    const threshold = input.marginThresholdPct ?? DEFAULT_MARGIN_THRESHOLD_PCT;
    const pct = Number.isFinite(input.marginPct) ? input.marginPct : 0;
    let status: MarginGateResult['status'];
    if (pct < threshold) status = 'fail';
    else if (pct < threshold + 5) status = 'warn';
    else status = 'pass';
    const requiresOverride = status === 'fail';
    const canProceed = !requiresOverride || !!input.hasOverridePermission;
    return { marginPct: pct, threshold, status, requiresOverride, canProceed };
}

/**
 * Audit-log payload shape for a margin override action. Persist at
 * `users/{uid}/quotes/{qid}/auditLog/{eventId}` so the trail follows
 * the quote (consistent with the v1.8 audit pattern).
 */
export interface MarginOverrideAuditEvent {
    type: 'margin-override';
    marginPct: number;
    threshold: number;
    reason: string;
    overriddenByUid: string;
    overriddenByName: string;
    timestamp: any;
}
