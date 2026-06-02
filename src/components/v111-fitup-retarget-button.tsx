
'use client';

/**
 * One-shot button (v1.11 Phase A — Fit-Up quote-flow integration).
 *
 * Pulls Epic 9.2.x forward from v1.16 → v1.11 + flips them to
 * shipped, since the build landed in v1.11 (stories 9.2.1 module
 * integration, 9.2.2 quote-flow checkbox, 9.2.3 customer PDF
 * summary line). Also creates a Phase A umbrella row capturing
 * the end-to-end build that touched the highfield-quote-flow +
 * quote-financials + proposal-pdf + proposal-view + finalize.
 *
 * Idempotent — checks existing titles before creating, only flips
 * 9.2.x docs whose targetRelease isn't already v1.11. Removed in
 * the cleanup commit after the user clicks.
 */

import { useState } from 'react';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Wrench, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STORY_REFS_TO_RETARGET = ['9.2.1', '9.2.2', '9.2.3'] as const;
const TARGET_RELEASE = 'v1.11';

const NEW_STORY = {
    title: 'v1.11 Phase A — Fit-Up quote-flow end-to-end (umbrella build row)',
    description: 'End-to-end fit-up integration: FitUpQuoteSelector mounted in Step 5 of highfield-quote-flow, fitUpTotal + fitUpCost wired into quote-financials, fitUpSelections snapshotted at finalize, single "Fit-up & Rigging" summary line on customer PDF + proposal-view (per Story 9.2.3 locked product decision). Catalogue-wide selection; per-module restriction deferred. Pulls Epic 9.2.x forward from v1.16 to satisfy the team\'s "end-to-end quote with fit-up" priority.',
    points: 5,
    type: 'feature' as const,
};

export function V111FitUpRetargetButton() {
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

            let retargeted = 0;
            let alreadyAtV111 = 0;
            let created = 0;
            const writes: Promise<unknown>[] = [];

            // (A) Retarget 9.2.x stories to v1.11 + shipped.
            for (const docSnap of snap.docs) {
                const data = docSnap.data() as { title?: string; targetRelease?: string; status?: string; deletedAt?: any };
                if (data.deletedAt != null) continue;
                const title = (data.title ?? '').trim();
                const match = STORY_REFS_TO_RETARGET.find(ref =>
                    title.startsWith(`${ref} —`) || title.startsWith(`${ref} -`),
                );
                if (!match) continue;
                if (data.targetRelease === TARGET_RELEASE && data.status === 'shipped') {
                    alreadyAtV111++;
                    continue;
                }
                writes.push(
                    updateDoc(doc(firestore, 'features', docSnap.id), {
                        targetRelease: TARGET_RELEASE,
                        status: 'shipped',
                        updatedAt: serverTimestamp(),
                    }),
                );
                retargeted++;
            }

            // (B) Create the umbrella build-row, idempotent by title.
            if (!existingTitles.has(NEW_STORY.title)) {
                writes.push(
                    addDoc(collection(firestore, 'features'), {
                        title: NEW_STORY.title,
                        description: NEW_STORY.description,
                        type: NEW_STORY.type,
                        status: 'shipped',
                        targetRelease: TARGET_RELEASE,
                        priority: 'high',
                        points: NEW_STORY.points,
                        epicId: null,
                        voteIds: [],
                        tags: [],
                        submitterId: null,
                        submitterName: 'v1.11 fit-up build',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }),
                );
                created++;
            }

            await Promise.all(writes);

            toast({
                title: 'v1.11 Fit-Up retarget applied',
                description: `${retargeted} 9.2.x retargeted · ${alreadyAtV111} already at ${TARGET_RELEASE} · ${created} umbrella story created.`,
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
        <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40">
            <Wrench className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-emerald-900">One-shot: pull Epic 9.2.x to v1.11 + mark shipped (Fit-Up end-to-end)</p>
                <p className="text-[10px] text-emerald-800/80">
                    Retargets <strong>9.2.1 Fit-Up Module Tab</strong>, <strong>9.2.2 Include fit-up checkbox</strong>,
                    and <strong>9.2.3 Customer PDF Summary Line</strong> from v1.16 → v1.11, marks all three shipped,
                    and creates a v1.11 Phase A umbrella row capturing the end-to-end build (financials + finalize +
                    PDF + proposal view). Idempotent. Removed in the cleanup commit.
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
