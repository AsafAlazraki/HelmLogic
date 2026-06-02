
'use client';

/**
 * One-shot button (v1.11 Expansion close-out).
 *
 * Refocuses v1.11 on Fit-Up only. Stories that were built / staged in
 * the v1.11 dev cycle but belong to other epics get pushed to v1.12:
 *
 *   - 11.2.1 Service Quote Flow (Epic 11.2)
 *   - 11.1.3 / 11.1.4 Service Catalog refinements
 *   - 3.7.3 Motors Table read-view
 *   - 3.5.1 Suggestion Approval Queue
 *
 * They keep their existing status — the work is on the dev branch and
 * will ship when v1.11 merges to main, it just no longer counts as a
 * v1.11 release-narrative line item. v1.12 release notes will pick up
 * the formal headline.
 *
 * Also creates a v1.11 expansion umbrella row capturing the Phase B
 * build (catalog category + customerDescription + packages, quote-flow
 * search + qty + price-override + per-quote-note, fit-up lifecycle
 * status).
 *
 * Idempotent — re-clicks are safe (checks targetRelease + existing
 * umbrella title before mutating). Removed in the cleanup commit
 * alongside the original V111FitUpRetargetButton.
 */

import { useState } from 'react';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Wrench, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STORY_REFS_TO_PUSH_TO_V112 = ['11.2.1', '11.1.3', '11.1.4', '3.7.3', '3.5.1'] as const;
const TARGET_RELEASE = 'v1.12';

const UMBRELLA_STORY = {
    title: 'v1.11 Phase B — Fit-Up expansion (catalog + packages + qty/override/note + workshop status)',
    description: 'Expanded the v1.11 fit-up release: catalog gains `category` + `customerDescription` fields and a category filter chip; new `fitUpPackages` collection bundles items into named packages with one-click selection in the quote flow; quote selector adds free-text search, category chips, packages strip, and a per-line panel with qty stepper, per-quote price override, and per-quote operator note. Finalize snapshot expanded with quantity + priceOverride + quoteNote; financials roll qty × (override ?? sellPrice ?? cost). New workshop fitUpStatus on the quote (pending → scheduled → in-progress → complete) renders as a popover pill on the proposal-view header beside the sales lifecycle pill, orthogonal to it. Audit-logged via new `fit-up-status-changed` event type. PDF unchanged — customer-facing summary line still locked per Story 9.2.3.',
    points: 5,
    type: 'feature' as const,
};

export function V111ExpansionRetargetButton() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);

    const apply = async () => {
        setRunning(true);
        try {
            const snap = await getDocs(query(collection(firestore, 'features')));

            const existingTitles = new Set<string>();
            for (const docSnap of snap.docs) {
                const data = docSnap.data() as { title?: string; deletedAt?: any };
                if (data.deletedAt != null) continue;
                if (data.title) existingTitles.add(data.title.trim());
            }

            let pushedToV112 = 0;
            let alreadyAtV112 = 0;
            let umbrellaCreated = 0;
            const writes: Promise<unknown>[] = [];

            // (A) Push non-fit-up stories from v1.11 → v1.12. Status untouched —
            //     the code stays on the dev branch and ships when v1.11 merges.
            for (const docSnap of snap.docs) {
                const data = docSnap.data() as { title?: string; targetRelease?: string; deletedAt?: any };
                if (data.deletedAt != null) continue;
                const title = (data.title ?? '').trim();
                const match = STORY_REFS_TO_PUSH_TO_V112.find(ref =>
                    title.startsWith(`${ref} —`) || title.startsWith(`${ref} -`),
                );
                if (!match) continue;
                if (data.targetRelease === TARGET_RELEASE) {
                    alreadyAtV112++;
                    continue;
                }
                writes.push(
                    updateDoc(doc(firestore, 'features', docSnap.id), {
                        targetRelease: TARGET_RELEASE,
                        updatedAt: serverTimestamp(),
                    }),
                );
                pushedToV112++;
            }

            // (B) Create the v1.11 Phase B umbrella row, idempotent by title.
            if (!existingTitles.has(UMBRELLA_STORY.title)) {
                writes.push(
                    addDoc(collection(firestore, 'features'), {
                        title: UMBRELLA_STORY.title,
                        description: UMBRELLA_STORY.description,
                        type: UMBRELLA_STORY.type,
                        status: 'shipped',
                        targetRelease: 'v1.11',
                        priority: 'high',
                        points: UMBRELLA_STORY.points,
                        epicId: null,
                        voteIds: [],
                        tags: [],
                        submitterId: null,
                        submitterName: 'v1.11 expansion build',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }),
                );
                umbrellaCreated++;
            }

            await Promise.all(writes);

            toast({
                title: 'v1.11 Expansion retarget applied',
                description: `${pushedToV112} pushed to v1.12 · ${alreadyAtV112} already at v1.12 · ${umbrellaCreated} umbrella created.`,
            });
            setDone(true);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Retarget failed', description: String(err) });
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/40">
            <Wrench className="h-4 w-4 text-teal-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-teal-900">One-shot: refocus v1.11 on Fit-Up + push non-fit-up to v1.12</p>
                <p className="text-[10px] text-teal-800/80">
                    Pushes <strong>11.2.1 Service Quote Flow</strong>, <strong>11.1.3 / 11.1.4 Service Catalog refinements</strong>,
                    <strong> 3.7.3 Motors Table</strong>, <strong>3.5.1 Suggestion Approval Queue</strong> from v1.11 → v1.12
                    (status unchanged — code stays on dev). Creates a "v1.11 Phase B — Fit-Up expansion" umbrella row
                    capturing the catalog/packages/quote-flow/workshop-status build. Idempotent. Removed in the cleanup commit.
                </p>
            </div>
            <Button
                size="sm"
                variant={done ? 'outline' : 'default'}
                onClick={apply}
                disabled={running}
                className="rounded-xl shrink-0"
            >
                {running ? (
                    <>
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Applying…
                    </>
                ) : done ? (
                    <>
                        <Check className="h-3.5 w-3.5 mr-1" /> Applied
                    </>
                ) : (
                    'Apply'
                )}
            </Button>
        </div>
    );
}
