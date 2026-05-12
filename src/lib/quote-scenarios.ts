/**
 * Quote scenarios (v1.9 — story 1.1.3).
 *
 * "Scenario" = a sibling quote of an original, used by salespeople to
 * present multiple offers side by side ("Trade-in option", "Cash deal",
 * "Finance bundle"). Scenarios share a `parentQuoteId` that points at
 * the ROOT quote of the family and carry a human-readable `scenarioLabel`
 * for identification in the sibling list.
 *
 * Relationship model:
 *   ROOT       — the original quote (no `parentQuoteId`, no `scenarioLabel`)
 *   SCENARIO   — has `parentQuoteId === root.id` and `scenarioLabel` set;
 *                its own quote `id` and quote `quoteNumber` are unique
 *   v1.8 FORK  — has `parentQuoteId === some.id` (could be root or a
 *                scenario) and `version > 1`. Outside the v1.1.3 sibling-
 *                list scope; v1.10+ when we layer scenario × version
 *                navigation
 *
 * Reuses v1.8 `forkLockedQuote()` machinery (carry over content overrides,
 * fire audit events on both ends, allocate child id before write) but
 * branches on three things:
 *   1. version stays at 1 — scenarios are siblings, not children
 *   2. parentQuoteId points at the ROOT, not the immediate parent (so a
 *      scenario created from another scenario still siblings under the
 *      root)
 *   3. a brand-new `quoteNumber` is allocated so /proposals/[quoteNumber]
 *      routing finds the right doc per scenario
 *
 * Schema additions on the new scenario doc:
 *   scenarioLabel:   string         — human-readable label entered by sales
 *   parentQuoteId:   string         — id of the root quote
 *
 * Audit log:
 *   'scenario-created' event fires on BOTH the parent (root) and the new
 *   scenario, mirroring the v1.8 fork pattern. Metadata carries
 *   `scenarioLabel` + `siblingQuoteId` for the Activity-tab summary.
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    where,
    type Firestore,
} from 'firebase/firestore';
import { useMemo } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { logAuditEvent } from '@/lib/quote-audit-log';

interface ActorContext {
    byUid: string;
    byName: string;
}

export interface CreateScenarioResult {
    scenarioQuoteId: string;
    scenarioQuoteNumber: string;
    /** The root id this scenario sits under (== from-quote.parentQuoteId ?? from-quote.id). */
    rootQuoteId: string;
}

/**
 * Allocate a new customer-facing quote number for a scenario.
 *
 * Mirrors finalize-quote-dialog.tsx#generateQuoteNumber():
 *     ${orgCode}-Q${ts}${rand}
 * Org code is extracted from the parent's quote number prefix (the chars
 * before the first '-'). Falls back to 'ORG' if parent number is malformed.
 */
function makeScenarioQuoteNumber(parentQuoteNumber: string | null | undefined): string {
    const orgCode = (parentQuoteNumber ?? '').split('-')[0] || 'ORG';
    const ts = Date.now().toString(36).toUpperCase().slice(-5);
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${orgCode}-Q${ts}${rand}`;
}

/**
 * Create a sibling scenario quote from an existing one.
 *
 * Copies every field on `fromQuoteId` EXCEPT lock + lifecycle + send-
 * tracking fields, allocates a fresh doc id + quote number, parents to
 * the ROOT of the family (so siblings stay siblings even when authored
 * from another scenario), and writes the operator-supplied label.
 *
 * Carries over content overrides (1.2.3 subcollection) so personalisations
 * the operator made on the source survive the duplication.
 *
 * Idempotency: NOT idempotent. Every call creates a new doc — by design;
 * "Create Scenario" is an explicit operator action and accidental double-
 * clicks should be prevented in the UI (disable while submitting).
 */
export async function createQuoteScenario(
    firestore: Firestore,
    ownerUid: string,
    fromQuoteId: string,
    scenarioLabel: string,
    actor: ActorContext,
): Promise<CreateScenarioResult> {
    const trimmedLabel = scenarioLabel.trim();
    if (!trimmedLabel) {
        throw new Error('createQuoteScenario: scenarioLabel is required');
    }
    const fromRef = doc(firestore, 'users', ownerUid, 'quotes', fromQuoteId);
    const fromSnap = await getDoc(fromRef);
    if (!fromSnap.exists()) {
        throw new Error(`createQuoteScenario: source quote ${fromQuoteId} not found under user ${ownerUid}`);
    }
    const fromData = fromSnap.data();

    // The ROOT is whichever ancestor has no parentQuoteId. If the source
    // already has a parentQuoteId, it's a scenario itself, so its parent
    // IS the root. Otherwise the source IS the root.
    const rootQuoteId = (fromData.parentQuoteId as string | undefined) ?? fromQuoteId;

    const scenarioRef = doc(collection(firestore, 'users', ownerUid, 'quotes'));
    const scenarioQuoteId = scenarioRef.id;
    const scenarioQuoteNumber = makeScenarioQuoteNumber(fromData.quoteNumber);

    // Strip the fields that don't carry over. Anything not destructured
    // here flows through via `...carriedFields`.
    const {
        // Identity / numbering — replaced.
        id: _id,
        quoteNumber: _qn,
        // Versioning — siblings are v1 of themselves.
        version: _v,
        parentQuoteId: _pq,
        // Lock state — fresh scenarios are unlocked.
        isLocked: _il,
        lockedAt: _la,
        lockedByUid: _lbu,
        lockedByName: _lbn,
        lockedReason: _lr,
        // Send-tracking — fresh scenarios have zero sends.
        lastSentAt: _lsa,
        sentCount: _sc,
        // Lifecycle — fresh scenarios are drafts.
        lifecycleState: _ls,
        lifecycleStateAt: _lsaAt,
        lifecycleStateByUid: _lsbu,
        lifecycleStateByName: _lsbn,
        // Scenario label — replaced with the new one.
        scenarioLabel: _slOld,
        // Timestamps — server-stamped on insert.
        createdAt: _ca,
        updatedAt: _ua,
        ...carriedFields
    } = fromData;

    await setDoc(scenarioRef, {
        ...carriedFields,
        id: scenarioQuoteId,
        quoteNumber: scenarioQuoteNumber,
        version: 1,
        parentQuoteId: rootQuoteId,
        scenarioLabel: trimmedLabel,
        isLocked: false,
        lifecycleState: 'draft',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // createdByUid + createdByName preserved from source so the
        // assigned salesperson stays the same on the scenario by default
        // — matches the fork pattern. Operator can hand off via existing UI.
    });

    // Carry over per-quote content overrides — mirrors forkLockedQuote.
    try {
        const overridesSnap = await getDocs(
            collection(firestore, 'users', ownerUid, 'quotes', fromQuoteId, 'contentOverrides'),
        );
        for (const ov of overridesSnap.docs) {
            await setDoc(
                doc(firestore, 'users', ownerUid, 'quotes', scenarioQuoteId, 'contentOverrides', ov.id),
                ov.data(),
            );
        }
    } catch (e) {
        console.warn('[create-scenario] contentOverrides carry-over failed (non-fatal):', e);
    }

    // Audit events on both ends — parent's Activity sees "scenario
    // spawned", the new scenario's Activity sees "created from X".
    await logAuditEvent(firestore, ownerUid, rootQuoteId, {
        eventType: 'scenario-created',
        byUid: actor.byUid,
        byName: actor.byName,
        metadata: {
            scenarioLabel: trimmedLabel,
            siblingQuoteId: scenarioQuoteId,
        },
    });
    await logAuditEvent(firestore, ownerUid, scenarioQuoteId, {
        eventType: 'scenario-created',
        byUid: actor.byUid,
        byName: actor.byName,
        metadata: {
            scenarioLabel: trimmedLabel,
            parentQuoteId: rootQuoteId,
        },
    });

    return { scenarioQuoteId, scenarioQuoteNumber, rootQuoteId };
}

/* ──────────────────────────────────────────────────────────────────
 * HOOK — sibling tree subscription
 *
 * Returns the ordered list of quotes in the same scenario family:
 *   [root, ...scenarios in creation order]
 * Excludes v1.8 fork-children (parentQuoteId === non-root) — they're a
 * separate navigation concept, deferred to v1.10+.
 * ────────────────────────────────────────────────────────────────── */

export interface SiblingScenario {
    id: string;
    quoteNumber: string;
    scenarioLabel?: string | null;
    lifecycleState?: string | null;
    isLocked?: boolean;
    /** True when this row is the original (no scenarioLabel and equals rootId). */
    isRoot: boolean;
    /** True when this row IS the currently-viewed quote. */
    isCurrent: boolean;
}

/**
 * Live subscription to a quote's siblings under the same root.
 *
 * Returns `null` data when the inputs aren't ready (mirrors the existing
 * useCollection hook surface so callers can guard on it).
 */
export function useSiblingScenarios(
    ownerUid: string | null | undefined,
    currentQuote: any | null,
): { data: SiblingScenario[] | null } {
    const firestore = useFirestore();

    const rootId = currentQuote
        ? ((currentQuote.parentQuoteId as string | undefined) ?? currentQuote.id)
        : null;

    // Scenarios under this root.
    const siblingsRef = useMemoFirebase(
        () => (ownerUid && rootId
            ? query(
                collection(firestore, 'users', ownerUid, 'quotes'),
                where('parentQuoteId', '==', rootId),
            )
            : null),
        [firestore, ownerUid, rootId],
    );
    const { data: siblings } = useCollection<any>(siblingsRef);

    // Root doc — only fetch separately when the currently-viewed quote
    // isn't itself the root.
    const rootRef = useMemoFirebase(
        () => (ownerUid && rootId && currentQuote?.id !== rootId
            ? doc(firestore, 'users', ownerUid, 'quotes', rootId)
            : null),
        [firestore, ownerUid, rootId, currentQuote?.id],
    );
    const { data: rootDoc } = useDoc<any>(rootRef);

    return useMemo(() => {
        if (!currentQuote || !rootId) return { data: null };

        // Establish the root row. If we're on the root, it's currentQuote
        // itself; if we're on a scenario, it's rootDoc (the separate fetch).
        const rootRow = currentQuote.id === rootId ? currentQuote : rootDoc;

        const rows: SiblingScenario[] = [];
        if (rootRow) {
            rows.push({
                id: rootRow.id,
                quoteNumber: rootRow.quoteNumber,
                scenarioLabel: rootRow.scenarioLabel ?? null,
                lifecycleState: rootRow.lifecycleState ?? null,
                isLocked: rootRow.isLocked === true,
                isRoot: true,
                isCurrent: rootRow.id === currentQuote.id,
            });
        }

        // Filter out any v1.8 fork-children that happen to have
        // parentQuoteId === rootId but version > 1 (a fork of root itself
        // would slot in here). Scenarios are version === 1 by definition.
        const scenarioRows = (siblings ?? [])
            .filter((s: any) => (typeof s.version !== 'number' || s.version === 1))
            .map((s: any): SiblingScenario => ({
                id: s.id,
                quoteNumber: s.quoteNumber,
                scenarioLabel: s.scenarioLabel ?? null,
                lifecycleState: s.lifecycleState ?? null,
                isLocked: s.isLocked === true,
                isRoot: false,
                isCurrent: s.id === currentQuote.id,
            }));

        // Stable order: root first, then scenarios sorted by quoteNumber
        // (creation order is encoded in the timestamp portion of the
        // quote number, so this is "oldest scenario first").
        scenarioRows.sort((a, b) => (a.quoteNumber > b.quoteNumber ? 1 : -1));

        return { data: [...rows, ...scenarioRows] };
    }, [currentQuote, rootId, rootDoc, siblings]);
}
