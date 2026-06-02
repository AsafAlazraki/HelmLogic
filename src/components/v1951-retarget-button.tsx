
'use client';

/**
 * One-shot button (v1.9.5.1). Retargets Epic-9 stories 9.1.1 + 9.1.2
 * to `targetRelease: 'v1.9.5.1'` and `status: 'shipped'`, since the
 * schema + admin UI for those two stories landed in this release.
 *
 * Follow-up commit removes this button + this file once the user has
 * clicked it on the deployed dev branch (per CONVENTIONS.md "one-shot
 * seed lifecycle"). Idempotent — re-clicking it after the retarget
 * has already applied is a no-op (matches existing values).
 */

import { useState } from 'react';
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Wrench, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TARGET_STORY_REFS = ['9.1.1', '9.1.2'] as const;

export function V1951RetargetButton() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);

    const apply = async () => {
        setRunning(true);
        try {
            const featuresQuery = query(collection(firestore, 'features'));
            const snap = await getDocs(featuresQuery);

            let updated = 0;
            let alreadyShipped = 0;
            const updates: Promise<void>[] = [];

            for (const docSnap of snap.docs) {
                const data = docSnap.data() as { title?: string; targetRelease?: string; status?: string; deletedAt?: any };
                if (data.deletedAt != null) continue;
                const title = (data.title ?? '').trim();
                const match = TARGET_STORY_REFS.find(ref =>
                    title.startsWith(`${ref} —`) || title.startsWith(`${ref} -`),
                );
                if (!match) continue;

                if (data.targetRelease === 'v1.9.5.1' && data.status === 'shipped') {
                    alreadyShipped++;
                    continue;
                }

                updates.push(
                    updateDoc(doc(firestore, 'features', docSnap.id), {
                        targetRelease: 'v1.9.5.1',
                        status: 'shipped',
                        updatedAt: serverTimestamp(),
                    }),
                );
                updated++;
            }

            await Promise.all(updates);

            toast({
                title: 'v1.9.5.1 retarget applied',
                description: `${updated} story/stories retargeted · ${alreadyShipped} already on v1.9.5.1.`,
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
                <p className="text-xs font-bold text-amber-900">One-shot: mark 9.1.1 + 9.1.2 as shipped in v1.9.5.1</p>
                <p className="text-[10px] text-amber-800/80">
                    Click once after deploy. Updates Epic 9 stories <strong>9.1.1 — Master Fit-Up Catalog</strong> and{' '}
                    <strong>9.1.2 — Fit-Up Item Editor</strong> to <code>targetRelease: 'v1.9.5.1'</code> and{' '}
                    <code>status: 'shipped'</code>. This button is removed in the follow-up cleanup commit.
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
