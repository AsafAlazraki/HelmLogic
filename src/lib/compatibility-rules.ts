/**
 * v1.9 (1.1.2) — Compatibility Rule Enforcement.
 *
 * Feature × feature compatibility layer on top of the existing
 * numeric motor-filter (HP range + engine count) that lives in
 * `highfield-quote-flow.tsx`. The motor filter handles
 * numeric/categorical compat; this module handles arbitrary
 * "if you pick A you can't also pick B" / "if you pick A you
 * must also pick C" relationships between optional features.
 *
 * Schema: `modules/{moduleId}/compatibilityRules/{ruleId}`.
 *
 *   type='forbids'  — picking ANY of `whenSelected` while ANY of
 *                     `thenAlso` is also selected → violation.
 *                     Reason explains why the combo is invalid.
 *
 *   type='requires' — picking ANY of `whenSelected` while NOT ALL of
 *                     `thenAlso` are selected → violation. Reason
 *                     explains what the dependent is needed for.
 *
 * Rules with `isActive=false` are loaded but skipped at evaluation —
 * lets us ship starter rules in a dormant state for review before
 * they actually block / warn quotes.
 *
 * Author flow (per v1.9 build plan): engineering writes rules direct
 * to Firestore (Firebase Console). Admin UI deferred to v1.10+.
 *
 * Display strategy (3-pt scope): **inline WARN, non-blocking**. We
 * show the violations in an alert banner at the top of the relevant
 * step; we do NOT disable the offending checkboxes. The user is told
 * why the combo is invalid and can choose to fix it. Hard-blocking
 * is a v1.10 candidate once admins are authoring rules and we have
 * confidence the rule set is correct.
 */

import { collection, getDocs } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

export interface CompatibilityRule {
    id: string;
    name: string;
    type: 'forbids' | 'requires';
    /** Feature IDs whose selection triggers the rule. ANY-of semantics. */
    whenSelected: string[];
    /**
     * For `forbids`: feature IDs that may NOT be selected when the
     * trigger is active. For `requires`: feature IDs that MUST also
     * be selected when the trigger is active.
     */
    thenAlso: string[];
    /** User-facing message explaining the rule. Shown in the inline alert. */
    reason: string;
    /** Set false to load-but-skip a rule (review-before-activate). */
    isActive: boolean;
}

export interface CompatibilityViolation {
    ruleId: string;
    ruleName: string;
    type: 'forbids' | 'requires';
    reason: string;
    /**
     * For `forbids`: IDs that are simultaneously selected and would
     * need to be removed. For `requires`: IDs that are missing and
     * would need to be added.
     */
    conflictingIds: string[];
}

/**
 * Evaluate a set of selected feature IDs against a rule list.
 * Inactive rules are skipped. Returns one violation per failing rule.
 */
export function evaluateCompatibility(
    selectedIds: ReadonlySet<string> | string[],
    rules: CompatibilityRule[],
): CompatibilityViolation[] {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
    const out: CompatibilityViolation[] = [];

    for (const rule of rules) {
        if (!rule.isActive) continue;
        const triggered = rule.whenSelected.some(id => selected.has(id));
        if (!triggered) continue;

        if (rule.type === 'forbids') {
            const conflicting = rule.thenAlso.filter(id => selected.has(id));
            if (conflicting.length === 0) continue;
            out.push({
                ruleId: rule.id,
                ruleName: rule.name,
                type: 'forbids',
                reason: rule.reason,
                conflictingIds: conflicting,
            });
        } else {
            // requires
            const missing = rule.thenAlso.filter(id => !selected.has(id));
            if (missing.length === 0) continue;
            out.push({
                ruleId: rule.id,
                ruleName: rule.name,
                type: 'requires',
                reason: rule.reason,
                conflictingIds: missing,
            });
        }
    }

    return out;
}

/**
 * Load every compatibility rule attached to a module. Returns an
 * empty array on read failure (module may not have any rules yet).
 */
export async function loadCompatibilityRules(
    firestore: Firestore,
    moduleId: string,
): Promise<CompatibilityRule[]> {
    try {
        const snap = await getDocs(collection(firestore, 'modules', moduleId, 'compatibilityRules'));
        const out: CompatibilityRule[] = [];
        for (const d of snap.docs) {
            const data = d.data() as Partial<CompatibilityRule>;
            out.push({
                id: d.id,
                name: data.name ?? '(unnamed rule)',
                type: (data.type === 'requires' ? 'requires' : 'forbids'),
                whenSelected: Array.isArray(data.whenSelected) ? data.whenSelected : [],
                thenAlso: Array.isArray(data.thenAlso) ? data.thenAlso : [],
                reason: data.reason ?? '',
                isActive: data.isActive !== false,
            });
        }
        return out;
    } catch {
        return [];
    }
}
