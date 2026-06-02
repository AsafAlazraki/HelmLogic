
'use client';

/**
 * One-shot button (v1.10 — Fit-Up groundwork). Marks Epic-9 stories
 * 9.1.1, 9.1.2, 9.1.3, 9.1.4 as `targetRelease: 'v1.10'` and
 * `status: 'shipped'` once the v1.10 release lands.
 *
 * Idempotent — re-clicking after the retarget has already applied is
 * a no-op. Follow-up cleanup commit removes this button + file once
 * the user has clicked it on the deployed dev branch (per
 * CONVENTIONS.md "one-shot seed lifecycle").
 */

import { useState } from 'react';
import { collection, doc, getDocs, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Wrench, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/** Story-ID prefixes that are SHIPPED at v1.10 (title-prefix match). */
const TARGET_STORY_REFS = ['9.1.1', '9.1.2', '9.1.3', '9.1.4', '11.1.1', '11.1.2', '3.7.2'] as const;

/** Stories WITHOUT a canonical number prefix that we also need to flip to
 *  shipped at v1.10. Matched by exact title string (trim) — the user
 *  curated these as free-text bug entries before the planning system
 *  enforced numbered prefixes. */
const TARGET_FREEFORM_TITLES = [
    'Cover letter not appearing in Proposal',           // shipped in b516d4e
    'No Names on Dealer Fit Options - Summary Quote',   // shipped in b516d4e
] as const;

const TARGET_RELEASE = 'v1.10';

export function V110RetargetButton() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);

    const apply = async () => {
        setRunning(true);
        try {
            const snap = await getDocs(query(collection(firestore, 'features')));

            let updated = 0;
            let alreadyShipped = 0;
            const updates: Promise<void>[] = [];

            for (const docSnap of snap.docs) {
                const data = docSnap.data() as { title?: string; targetRelease?: string; status?: string; deletedAt?: any };
                if (data.deletedAt != null) continue;
                const title = (data.title ?? '').trim();
                const prefixMatch = TARGET_STORY_REFS.find(ref =>
                    title.startsWith(`${ref} —`) || title.startsWith(`${ref} -`),
                );
                const freeformMatch = TARGET_FREEFORM_TITLES.some(t => title === t);
                if (!prefixMatch && !freeformMatch) continue;

                if (data.targetRelease === TARGET_RELEASE && data.status === 'shipped') {
                    alreadyShipped++;
                    continue;
                }

                updates.push(
                    updateDoc(doc(firestore, 'features', docSnap.id), {
                        targetRelease: TARGET_RELEASE,
                        status: 'shipped',
                        updatedAt: serverTimestamp(),
                    }),
                );
                updated++;
            }

            await Promise.all(updates);

            toast({
                title: 'v1.10 Fit-Up retarget applied',
                description: `${updated} story/stories retargeted · ${alreadyShipped} already on ${TARGET_RELEASE}.`,
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
        <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40">
            <Wrench className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-900">One-shot: mark v1.10 shipped stories</p>
                <p className="text-[10px] text-amber-800/80">
                    Click once after deploy. Flips to <code>targetRelease: 'v1.10' / status: 'shipped'</code>:{' '}
                    <strong>9.1.1 / 9.1.2 / 9.1.3 / 9.1.4</strong> (Fit-Up admin),{' '}
                    <strong>11.1.1 / 11.1.2</strong> (Service Catalog),{' '}
                    <strong>3.7.2</strong> (Boats table read view),{' '}
                    plus <strong>Cover letter not appearing in Proposal</strong> and{' '}
                    <strong>No Names on Dealer Fit Options</strong> (both fixed in b516d4e bug pass).
                    Idempotent. Removed in the follow-up cleanup commit.
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
