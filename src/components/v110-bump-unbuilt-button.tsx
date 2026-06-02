
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
import { collection, doc, getDocs, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/** Stories that DID ship at v1.10 (matches V110RetargetButton). Title-prefix match. */
const SHIPPED_AT_V110_REFS = ['9.1.1', '9.1.2', '9.1.3', '9.1.4', '11.1.1', '11.1.2'] as const;

const FROM_RELEASE = 'v1.10';
const TO_RELEASE = 'v1.11';

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
            let keptAtV110 = 0;
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
                const isKnownV110Ship = SHIPPED_AT_V110_REFS.some(ref =>
                    title.startsWith(`${ref} —`) || title.startsWith(`${ref} -`),
                );
                if (isKnownV110Ship) {
                    keptAtV110++;
                    continue;
                }

                updates.push(
                    updateDoc(doc(firestore, 'features', docSnap.id), {
                        targetRelease: TO_RELEASE,
                        updatedAt: serverTimestamp(),
                    }),
                );
                bumped++;
            }

            await Promise.all(updates);

            toast({
                title: `Bumped to ${TO_RELEASE}`,
                description: `${bumped} unbuilt story/stories moved · ${keptAtV110} known-shipped kept at ${FROM_RELEASE}.`,
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
                <p className="text-xs font-bold text-sky-900">One-shot: bump unbuilt v1.10 stories → v1.11 (close-out)</p>
                <p className="text-[10px] text-sky-800/80">
                    Click after V110RetargetButton. Moves any story still parked at <code>v1.10</code> that we did NOT
                    build (module / parts / cross-cutting residue from the original v1.10 restructure plan) forward to{' '}
                    <code>v1.11</code>. Known v1.10 ships (Fit-Up 9.1.x + Service Catalog 11.1.x) stay put. Idempotent.
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
