
'use client';

/**
 * One-shot button (v1.9.5 retroactive backfill).
 *
 * v1.9.5 shipped to prod (PR #36) but no planning rows were ever
 * created to represent the work. Result: the Roadmap renders
 * "v1.9.5 · 0 activities · 0 pts" even though the release was a
 * sizeable planning + groundwork + hotfix bundle.
 *
 * This button seeds the missing stories as `targetRelease: 'v1.9.5'`,
 * `status: 'shipped'` so the timeline reflects reality. Idempotent —
 * the seed checks for existing titles before creating, so re-clicks
 * are no-ops. Cleanup commit removes this button + file once
 * confirmed.
 *
 * Per CONVENTIONS.md one-shot lifecycle.
 */

import { useState } from 'react';
import { addDoc, collection, getDocs, query, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Archive, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SeedStory {
    title: string;
    description?: string;
    points: number;
    type: 'feature' | 'bug' | 'tech-debt';
}

const V195_STORIES: SeedStory[] = [
    {
        title: 'v1.9.5 — Roadmap reshuffle to dealer-ops priority (157 stories re-targeted)',
        description: 'Auto-Apply restructure pass moved every dealer-ops / customer / cross-cutting story into its correct release bucket. Drained the Submitted column, established the sequential v1.10–v1.40 runway.',
        points: 5,
        type: 'tech-debt',
    },
    {
        title: 'v1.9.5 — Capacity-aware bin-packing across releases',
        description: 'Unified CapacityTracker threaded through every pack pass so per-lane packers see real cumulative load + roll forward when a bucket is full. Replaced the per-lane independent packers that caused 138-pt pileups.',
        points: 3,
        type: 'tech-debt',
    },
    {
        title: 'v1.9.5 — Service Quoting groundwork (Epic 11 seed + NSM-Hub absorption plan)',
        description: 'Epic 11 — Service Quoting seeded into the planning board (planned, NOT built). Absorption plan locked: NSM-Hub service-quote module becomes a module within HelmLogic, shared schema, zero-downtime migration.',
        points: 5,
        type: 'feature',
    },
    {
        title: 'v1.9.5 — Clickable release-detail popups on the Roadmap',
        description: 'Release headers on the Roadmap are now clickable. Popup shows every activity in that release grouped by epic with points + status badges.',
        points: 2,
        type: 'feature',
    },
    {
        title: 'v1.9.5 — Create Proposal crash hotfix (SendQuoteDialog emailTemplates gating)',
        description: 'Bill Hull crashed on Create Proposal — emailTemplates subscription fired unconditionally on every page load + the query forced a composite index. Gated subscription on dialog open + dropped the orderBy (sort client-side). NOT a rules problem — code-level race.',
        points: 2,
        type: 'bug',
    },
    {
        title: 'v1.9.5 — Restructure Workbench tooling (in-app one-shot for the v1.10 reshuffle)',
        description: 'In-app per-row decision state machine for the restructure. Operator reviewed each retarget, applied individually, then a final Save committed all in one batch. Tooling removed in the same cycle per one-shot convention.',
        points: 3,
        type: 'tech-debt',
    },
];

export function V195StoriesSeedButton() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);

    const apply = async () => {
        setRunning(true);
        try {
            // Snapshot existing features so we can skip duplicates by title.
            const snap = await getDocs(query(collection(firestore, 'features')));
            const existingTitles = new Set<string>();
            for (const docSnap of snap.docs) {
                const data = docSnap.data() as { title?: string; deletedAt?: any };
                if (data.deletedAt != null) continue;
                if (data.title) existingTitles.add(data.title.trim());
            }

            let created = 0;
            let skipped = 0;
            const writes: Promise<unknown>[] = [];

            for (const story of V195_STORIES) {
                if (existingTitles.has(story.title)) {
                    skipped++;
                    continue;
                }
                writes.push(
                    addDoc(collection(firestore, 'features'), {
                        title: story.title,
                        description: story.description ?? null,
                        type: story.type,
                        status: 'shipped',
                        targetRelease: 'v1.9.5',
                        priority: 'medium',
                        points: story.points,
                        epicId: null,
                        voteIds: [],
                        tags: [],
                        submitterId: null,
                        submitterName: 'v1.9.5 backfill',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }),
                );
                created++;
            }

            await Promise.all(writes);

            toast({
                title: 'v1.9.5 backfill applied',
                description: `${created} story/stories created · ${skipped} already existed.`,
            });
            setDone(true);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Backfill failed', description: String(err) });
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/40">
            <Archive className="h-4 w-4 text-violet-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-violet-900">One-shot: backfill v1.9.5 stories (retroactive)</p>
                <p className="text-[10px] text-violet-800/80">
                    Creates the 6 planning rows for the work that shipped in v1.9.5 (roadmap reshuffle, capacity packing,
                    Epic 11 seed, clickable popups, Create Proposal hotfix, Workbench tooling) so the Roadmap timeline
                    isn't blank. All marked <code>status: 'shipped' / targetRelease: 'v1.9.5'</code>. Idempotent.
                    Removed in the cleanup commit.
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
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Seeding…
                    </>
                ) : done ? (
                    <>
                        <Check className="h-3.5 w-3.5 mr-1" /> Seeded
                    </>
                ) : (
                    'Seed'
                )}
            </Button>
        </div>
    );
}
