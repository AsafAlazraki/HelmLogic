
'use client';

/**
 * One-shot button (v1.10 close-out). Companion to V110RetargetButton.
 *
 * Walks every Firestore `features` doc and retargets any story still
 * sitting at `targetRelease: 'v1.10'` that we did NOT actually build
 * out to `v1.11`. The list of stories we DID build at v1.10 is
 * hardcoded in `SHIPPED_AT_V110_REFS` so the button is safe to click
 * in any order (before OR after V110RetargetButton — the shipped set
 * is recognised by title-prefix, not by `status` field, so it doesn't
 * matter whether the retarget has flipped them yet).
 *
 * Idempotent — re-clicking is a no-op (only acts on docs currently
 * at v1.10). Cleanup commit removes this button + V110RetargetButton
 * together after the user has clicked both on the deployed branch.
 *
 * Use case: the v1.10 restructure parked module/parts/cross-cutting
 * stories at v1.10 that the actual build pass did not include
 * (specific story IDs surface at v1.11 kickoff via the planning
 * workbench). This button moves the unbuilt residue forward so v1.10
 * on the Roadmap closes cleanly: every v1.10 story = shipped.
 */

import { useState } from 'react';
import { collection, doc, deleteField, getDocs, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/** Stories that DID ship at v1.10 (matches V110RetargetButton). Title-prefix match. */
const SHIPPED_AT_V110_REFS = ['9.1.1', '9.1.2', '9.1.3', '9.1.4', '11.1.1', '11.1.2', '3.7.2'] as const;
const SHIPPED_AT_V110_TITLES = [
    'Cover letter not appearing in Proposal',
    'No Names on Dealer Fit Options - Summary Quote',
] as const;

const FROM_RELEASE = 'v1.10';

/** Per-story destination. Story-prefix or exact-title match. Unmatched stories
 *  default to v1.11. Two specific cases:
 *   - 9.2.x stories belong with Epic 9.2 (v1.16+) per the locked product plan
 *   - "Test level of proposals -" is junk — soft-delete instead of bump
 */
const PREFIX_DESTINATIONS: Record<string, string> = {
    '9.2.1': 'v1.16',
    '9.2.2': 'v1.16',
    '9.2.3': 'v1.16',
};

const TITLES_TO_ARCHIVE: readonly string[] = [
    'Test level of proposals -',
    'Test level of proposals —',
];

const DEFAULT_DESTINATION = 'v1.11';

export function V110BumpUnbuiltButton() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);

    const apply = async () => {
        setRunning(true);
        try {
            const snap = await getDocs(query(collection(firestore, 'features')));

            let bumped = 0;
            let archived = 0;
            let keptAtV110 = 0;
            const bumpCounts: Record<string, number> = {};
            const updates: Promise<void>[] = [];

            for (const docSnap of snap.docs) {
                const data = docSnap.data() as {
                    title?: string;
                    targetRelease?: string;
                    status?: string;
                    deletedAt?: any;
                };
                if (data.deletedAt != null) continue;
                if (data.targetRelease !== FROM_RELEASE) continue;

                const title = (data.title ?? '').trim();

                // (A) Known v1.10 ships — leave alone (the retarget button handles them).
                const isKnownV110Ship =
                    SHIPPED_AT_V110_REFS.some(ref =>
                        title.startsWith(`${ref} —`) || title.startsWith(`${ref} -`),
                    ) ||
                    SHIPPED_AT_V110_TITLES.some(t => title === t);
                if (isKnownV110Ship) {
                    keptAtV110++;
                    continue;
                }

                // (B) Archive list — soft-delete instead of bumping.
                if (TITLES_TO_ARCHIVE.some(t => title === t)) {
                    updates.push(
                        updateDoc(doc(firestore, 'features', docSnap.id), {
                            deletedAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        }),
                    );
                    archived++;
                    continue;
                }

                // (C) Story-prefix-based destination (e.g. 9.2.x → v1.16).
                let destination = DEFAULT_DESTINATION;
                const explicitPrefix = Object.keys(PREFIX_DESTINATIONS).find(prefix =>
                    title.startsWith(`${prefix} —`) || title.startsWith(`${prefix} -`),
                );
                if (explicitPrefix) destination = PREFIX_DESTINATIONS[explicitPrefix];

                updates.push(
                    updateDoc(doc(firestore, 'features', docSnap.id), {
                        targetRelease: destination,
                        updatedAt: serverTimestamp(),
                    }),
                );
                bumpCounts[destination] = (bumpCounts[destination] ?? 0) + 1;
                bumped++;
            }

            await Promise.all(updates);

            const bumpSummary = Object.entries(bumpCounts)
                .map(([rel, n]) => `${n} → ${rel}`)
                .join(' · ');

            toast({
                title: `v1.10 close-out applied`,
                description: `${bumped} bumped (${bumpSummary || 'none'}) · ${archived} archived · ${keptAtV110} kept at ${FROM_RELEASE}.`,
            });
            setDone(true);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Bump failed', description: String(err) });
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/40">
            <ArrowRight className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-sky-900">One-shot: close-out v1.10 (bump residue + archive junk)</p>
                <p className="text-[10px] text-sky-800/80">
                    Click after V110RetargetButton. Moves every story still parked at <code>v1.10</code> that we did NOT
                    ship: <strong>9.2.x</strong> → <code>v1.16</code> (Epic 9.2 quote-flow batch); awaiting-repro bugs +
                    deferred items → <code>v1.11</code>; <em>"Test level of proposals -"</em> → soft-deleted (archive).
                    Known v1.10 ships stay put. Idempotent. Removed in the cleanup commit.
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
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Bumping…
                    </>
                ) : done ? (
                    <>
                        <Check className="h-3.5 w-3.5 mr-1" /> Bumped
                    </>
                ) : (
                    'Bump'
                )}
            </Button>
        </div>
    );
}
