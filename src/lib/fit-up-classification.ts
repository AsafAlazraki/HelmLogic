/**
 * Fit-up classification rule engine (v1.15 — Story 9.3.1).
 *
 * Full operator-authored rule engine that replaces the v1.11 simplified
 * motor-HP heuristic. Rules live at
 * `organisations/{orgId}/fitUpClassificationRules/{ruleId}`.
 *
 * Shape:
 *   {
 *     id: string,
 *     name: string,              // human label, "Patrol ≥250 HP → Complex"
 *     priority: number,          // higher wins ties; 0 = default
 *     isActive: boolean,         // off-switch without delete
 *     conditions: Condition[],   // ALL must match (AND semantics)
 *     outputTier: 'simple' | 'medium' | 'complex',
 *   }
 *
 * Each Condition:
 *   { field: ClassificationField, operator: Operator, value: number | string }
 *
 * Fields:
 *   - motorHp     (number)   — biggest HP rating (multi-engine summed)
 *   - boatLengthM (number)   — hull length, metres
 *   - boatRange   (string)   — Sport / Classic / Patrol / ...
 *   - modelCode   (string)   — CL380 / SP600 / ...
 *   - vendorId    (string)   — Highfield / etc.
 *
 * Operators:
 *   number  : '>=' | '>' | '<=' | '<' | '==' | '!='
 *   string  : '==' | '!=' | 'contains' | 'startsWith'
 *
 * Resolution: at quote time, evaluate every active rule against the
 * QuoteContext. The first (by priority desc, then most-specific) rule
 * whose conditions all match returns its outputTier. If nothing matches,
 * fall back to the simplified motor-HP heuristic (the v1.11 behaviour) so
 * orgs that don't author rules see no regression.
 */

import {
    collection,
    type Firestore,
    onSnapshot,
    query as fsQuery,
} from 'firebase/firestore';

export type Tier = 'simple' | 'medium' | 'complex';
export type ClassificationField = 'motorHp' | 'boatLengthM' | 'boatRange' | 'modelCode' | 'vendorId';
export type NumberOperator = '>=' | '>' | '<=' | '<' | '==' | '!=';
export type StringOperator = '==' | '!=' | 'contains' | 'startsWith';
export type ConditionOperator = NumberOperator | StringOperator;

export interface Condition {
    field: ClassificationField;
    operator: ConditionOperator;
    value: number | string;
}

export interface ClassificationRule {
    id: string;
    name: string;
    priority?: number;
    isActive?: boolean;
    conditions: Condition[];
    outputTier: Tier;
}

export interface QuoteContext {
    motorHp?: number;
    boatLengthM?: number;
    boatRange?: string;
    modelCode?: string;
    vendorId?: string;
}

const NUMERIC_FIELDS: Set<ClassificationField> = new Set(['motorHp', 'boatLengthM']);

function getCtx(ctx: QuoteContext, field: ClassificationField): number | string | undefined {
    return (ctx as any)[field];
}

function evalCondition(c: Condition, ctx: QuoteContext): boolean {
    const value = getCtx(ctx, c.field);
    if (value === undefined || value === null) return false;
    if (NUMERIC_FIELDS.has(c.field)) {
        const a = Number(value);
        const b = Number(c.value);
        if (Number.isNaN(a) || Number.isNaN(b)) return false;
        switch (c.operator) {
            case '>=': return a >= b;
            case '>':  return a > b;
            case '<=': return a <= b;
            case '<':  return a < b;
            case '==': return a === b;
            case '!=': return a !== b;
            default: return false;
        }
    } else {
        const a = String(value).toLowerCase();
        const b = String(c.value).toLowerCase();
        switch (c.operator) {
            case '==':        return a === b;
            case '!=':        return a !== b;
            case 'contains':  return a.includes(b);
            case 'startsWith':return a.startsWith(b);
            default: return false;
        }
    }
}

/** Specificity score — more conditions = more specific. Used as a tiebreak
 *  when two rules share the same priority. */
function specificity(rule: ClassificationRule): number {
    return rule.conditions?.length ?? 0;
}

/** v1.11 fallback heuristic. Kept intentionally so orgs with no rules
 *  see no regression. */
function fallbackHeuristic(ctx: QuoteContext): Tier | null {
    const hp = ctx.motorHp;
    if (hp == null || !Number.isFinite(hp)) return null;
    if (hp >= 150) return 'complex';
    if (hp >= 50) return 'medium';
    return 'simple';
}

export function resolveClassification(rules: ClassificationRule[], ctx: QuoteContext): { tier: Tier | null; matched?: ClassificationRule; via: 'rule' | 'heuristic' | 'none' } {
    const active = (rules ?? []).filter(r => r.isActive !== false);
    // Sort by priority desc, then specificity desc.
    const sorted = [...active].sort((a, b) => {
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pa !== pb) return pb - pa;
        return specificity(b) - specificity(a);
    });
    for (const r of sorted) {
        if ((r.conditions ?? []).every(c => evalCondition(c, ctx))) {
            return { tier: r.outputTier, matched: r, via: 'rule' };
        }
    }
    const fb = fallbackHeuristic(ctx);
    return fb ? { tier: fb, via: 'heuristic' } : { tier: null, via: 'none' };
}

/** Subscribe to the org's rules collection. Returns the unsubscribe. */
export function subscribeToRules(
    firestore: Firestore,
    organisationId: string,
    cb: (rules: ClassificationRule[]) => void,
): () => void {
    const q = fsQuery(collection(firestore, 'organisations', organisationId, 'fitUpClassificationRules'));
    return onSnapshot(q, (snap) => {
        const list: ClassificationRule[] = [];
        snap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
        cb(list);
    });
}

export const CONDITION_FIELD_LABEL: Record<ClassificationField, string> = {
    motorHp: 'Motor HP',
    boatLengthM: 'Boat length (m)',
    boatRange: 'Boat range',
    modelCode: 'Model code',
    vendorId: 'Vendor',
};

export const TIER_LABEL: Record<Tier, string> = {
    simple: 'Simple',
    medium: 'Medium',
    complex: 'Complex',
};
