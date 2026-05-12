/**
 * v1.9 (1.1.2) — Highfield compatibility-rules auto-seed (one-shot).
 *
 * Writes a small set of EXAMPLE compatibility rules to
 * `modules/M1Yf3R9igpJDxJnOVr6f/compatibilityRules/{ruleId}`
 * (M1Yf3R9igpJDxJnOVr6f = Highfield Boats module per CLAUDE.md).
 *
 * The seeded rules ship with `isActive: false` and obvious-template
 * names so they load-but-skip at evaluation time. They exist to:
 *   1. Prove the infrastructure end-to-end (the team can immediately
 *      see one in the Firebase Console + duplicate it).
 *   2. Document the rule pattern in a place the team will actually
 *      look (next to the live data, not in a markdown file).
 *
 * Authoring flow (per v1.9 build plan): the engineering team replaces
 * the placeholder `whenSelected` / `thenAlso` feature IDs with real
 * IDs from `data-warehouse/LafOLpLb6QIFE856TiD4/ranges/{r}/models/{m}.optionalFeatures[].id`,
 * updates the reason text, flips `isActive: true`, and the warning
 * banner starts firing for any quote that triggers the rule.
 *
 * One-shot lifecycle per CONVENTIONS.md:
 *   1. Build the button on this commit
 *   2. User clicks the button on dev once
 *   3. Next dev push removes the button + this module
 *
 * Idempotent: each rule has a deterministic doc id (e.g.
 * `template-forbids-1`) so re-running overwrites the same docs
 * instead of multiplying templates.
 */

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const HIGHFIELD_MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';

interface SeedTemplateRule {
    id: string;
    name: string;
    type: 'forbids' | 'requires';
    whenSelected: string[];
    thenAlso: string[];
    reason: string;
}

/**
 * Three starter templates spanning the rule patterns the team will
 * most-commonly author. Each is INACTIVE on seed — flip `isActive`
 * in Firebase Console after replacing the placeholder feature IDs.
 */
const TEMPLATE_RULES: SeedTemplateRule[] = [
    {
        id: 'template-forbids-1',
        name: '[EXAMPLE — UPDATE BEFORE ACTIVATING] Two sun-shades conflict',
        type: 'forbids',
        whenSelected: ['REPLACE_WITH_TTOP_FEATURE_ID'],
        thenAlso: ['REPLACE_WITH_BIMINI_FEATURE_ID'],
        reason: 'A T-Top and a Bimini Top cannot be fitted together — they occupy the same mounting points.',
    },
    {
        id: 'template-requires-1',
        name: '[EXAMPLE — UPDATE BEFORE ACTIVATING] Helm seat needs a console',
        type: 'requires',
        whenSelected: ['REPLACE_WITH_HELM_SEAT_FEATURE_ID'],
        thenAlso: ['REPLACE_WITH_CONSOLE_FEATURE_ID'],
        reason: 'A helm seat can only be fitted when a console is also specified.',
    },
    {
        id: 'template-forbids-2',
        name: '[EXAMPLE — UPDATE BEFORE ACTIVATING] Bow ladder vs anchor locker',
        type: 'forbids',
        whenSelected: ['REPLACE_WITH_BOW_LADDER_FEATURE_ID'],
        thenAlso: ['REPLACE_WITH_ANCHOR_LOCKER_FEATURE_ID'],
        reason: 'A bow boarding ladder and a front anchor locker compete for the same forward deck space.',
    },
];

export interface SeedV19HighfieldCompatResult {
    rulesCreated: number;
    rulesAlreadyPresent: number;
    moduleId: string;
}

/**
 * Idempotent — re-running overwrites the same template doc ids
 * (with `merge: true` semantics) instead of multiplying templates.
 */
export async function seedV19HighfieldCompat(firestore: Firestore): Promise<SeedV19HighfieldCompatResult> {
    let rulesCreated = 0;
    let rulesAlreadyPresent = 0;

    for (const tmpl of TEMPLATE_RULES) {
        const ref = doc(firestore, 'modules', HIGHFIELD_MODULE_ID, 'compatibilityRules', tmpl.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            rulesAlreadyPresent++;
            continue;
        }
        await setDoc(ref, {
            name: tmpl.name,
            type: tmpl.type,
            whenSelected: tmpl.whenSelected,
            thenAlso: tmpl.thenAlso,
            reason: tmpl.reason,
            isActive: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        rulesCreated++;
    }

    return { rulesCreated, rulesAlreadyPresent, moduleId: HIGHFIELD_MODULE_ID };
}
