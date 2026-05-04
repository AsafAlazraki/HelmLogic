'use client';

/**
 * Quote Content Manager (v1.7 — story 1.8.1, Phase B).
 *
 * Top-level surface for the new "Quote Content" tab in
 * /manage. Master-detail layout:
 *   - Left: list of 7 fixed block types with status indicators
 *   - Right: selected block's metadata + read-only HTML preview
 *
 * Phase B scope: tab loads, list renders, auto-migrates the legacy
 * organisation.termsAndConditions textarea into a
 * `terms-and-conditions` block on first open. Editor (Phase C) and
 * brand-override picker (Phase D) land in subsequent commits.
 */

import { useEffect, useMemo, useState } from 'react';
import {
    collection,
    doc,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';
import {
    BLOCK_TYPES,
    type ContentBlock,
    textToTipTapHtml,
} from '@/lib/content-blocks';
import { ContentBlockList } from '@/components/content-block-list';
import { ContentBlockDetail } from '@/components/content-block-detail';

interface Props {
    orgId: string;
    /** From the parent page — used for the auto-migrate's "did the org ever have legacy T&Cs?" check. */
    legacyTermsAndConditions: string | null | undefined;
    /** Drives the brand-override picker (Phase D). Source per Q2 popup: modules the org has access to. */
    enabledModuleSubscriptions: string[] | null | undefined;
}

export function QuoteContentManager({ orgId, legacyTermsAndConditions, enabledModuleSubscriptions }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);

    const blocksRef = useMemoFirebase(
        () => collection(firestore, `organisations/${orgId}/contentBlocks`),
        [firestore, orgId],
    );
    const { data: blocks, loading: blocksLoading } = useCollection<ContentBlock>(blocksRef);

    /** Default selection — Terms & Conditions, since that's what every org will have at minimum. */
    const [selectedBlockType, setSelectedBlockType] = useState<typeof BLOCK_TYPES[number]>('terms-and-conditions');

    /** Migration guard — only run once per session, only when conditions met. */
    const [migrated, setMigrated] = useState(false);

    useEffect(() => {
        if (migrated) return;
        if (blocksLoading) return;
        if (!user) return;
        if (!legacyTermsAndConditions || !legacyTermsAndConditions.trim()) return;
        if ((blocks ?? []).length > 0) {
            // Already has content blocks — either already migrated this session or migrated before. No-op.
            setMigrated(true);
            return;
        }

        // First-open migration: create a terms-and-conditions block from the legacy textarea.
        const blockId = doc(collection(firestore, `organisations/${orgId}/contentBlocks`)).id;
        const submitterName = userProfile?.displayName || userProfile?.email || user.email || 'Migration';
        const html = textToTipTapHtml(legacyTermsAndConditions);

        setDoc(doc(firestore, `organisations/${orgId}/contentBlocks/${blockId}`), {
            blockType: 'terms-and-conditions',
            html,
            startsOnNewPage: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedByUid: user.uid,
            updatedByName: `${submitterName} (auto-migrated from legacy T&Cs)`,
        })
            .then(() => {
                toast({
                    title: 'T&Cs migrated to content block',
                    description: 'You can now edit them with rich text and add per-brand overrides. The legacy field is preserved as a fallback.',
                });
                setMigrated(true);
            })
            .catch((e: any) => {
                toast({
                    variant: 'destructive',
                    title: 'T&Cs migration failed',
                    description: e?.message ?? 'See console.',
                });
                console.error('[content-blocks] migration failed', e);
            });
    }, [migrated, blocksLoading, blocks, legacyTermsAndConditions, user, userProfile, firestore, orgId, toast]);

    /** Map blockType → existing doc (or undefined when not yet authored). */
    const blockByType = useMemo(() => {
        const m = new Map<string, ContentBlock>();
        for (const b of blocks ?? []) {
            if (b.blockType) m.set(b.blockType, b);
        }
        return m;
    }, [blocks]);

    const selectedBlock = blockByType.get(selectedBlockType);

    return (
        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
            <ContentBlockList
                selectedBlockType={selectedBlockType}
                onSelect={setSelectedBlockType}
                blockByType={blockByType}
                loading={blocksLoading}
            />
            <ContentBlockDetail
                orgId={orgId}
                blockType={selectedBlockType}
                block={selectedBlock}
                enabledModuleSubscriptions={enabledModuleSubscriptions}
            />
        </div>
    );
}
