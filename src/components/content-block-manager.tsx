'use client';

/**
 * Content Block Manager (v1.7 — story 1.8.5 / 1.8.6 / 1.8.9).
 *
 * Renamed from QuoteContentManager (1.8.1) — now manages content
 * blocks for either Quote OR Contract documents under the unified
 * Document Templates tab (1.8.5). Filters blocks by documentType
 * (1.8.6); shows the Document Templates page aesthetic (1.8.9).
 *
 * Master-detail layout:
 *   - Left: list of fixed block types (filtered to current docType)
 *   - Right: editor / read-only preview / version history / brand override
 *
 * The auto-migration from 1.8.1 still fires here — when the Quote
 * sub-tab opens for the first time and the org has legacy
 * organisation.termsAndConditions text but no content blocks, we
 * create a terms-and-conditions block tagged for BOTH document
 * types (T&Cs apply to quotes and contracts alike).
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
    blockBelongsTo,
    textToTipTapHtml,
    type ContentBlock,
    type DocumentType,
} from '@/lib/content-blocks';
import { ContentBlockList } from '@/components/content-block-list';
import { ContentBlockDetail } from '@/components/content-block-detail';

interface Props {
    orgId: string;
    /** v1.7 (1.8.6) — filter to blocks belonging to this document type. */
    documentType: DocumentType;
    /** From the parent page — used for the auto-migrate's "did the org ever have legacy T&Cs?" check. */
    legacyTermsAndConditions: string | null | undefined;
    /** Drives the brand-override picker (Phase D). Source per Q2 popup: modules the org has access to. */
    enabledModuleSubscriptions: string[] | null | undefined;
    /** v1.7 (1.8.7) — fed into the live PDF preview's fixture so the cover branding looks real. */
    organisationName: string | null | undefined;
    primaryLogoUrl: string | null | undefined;
    secondaryLogoUrl: string | null | undefined;
}

export function ContentBlockManager({ orgId, documentType, legacyTermsAndConditions, enabledModuleSubscriptions, organisationName, primaryLogoUrl, secondaryLogoUrl }: Props) {
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

    /** Default selection — Terms & Conditions, since every org will have at minimum after migration. */
    const [selectedBlockType, setSelectedBlockType] = useState<typeof BLOCK_TYPES[number]>('terms-and-conditions');

    /** Migration guard — only run once per session, only when conditions met. Quote tab only. */
    const [migrated, setMigrated] = useState(false);

    useEffect(() => {
        if (migrated) return;
        if (documentType !== 'quote') return; // Migration anchored to the Quote tab only.
        if (blocksLoading) return;
        if (!user) return;
        if (!legacyTermsAndConditions || !legacyTermsAndConditions.trim()) return;
        if ((blocks ?? []).length > 0) {
            setMigrated(true);
            return;
        }

        const blockId = doc(collection(firestore, `organisations/${orgId}/contentBlocks`)).id;
        const submitterName = userProfile?.displayName || userProfile?.email || user.email || 'Migration';
        const html = textToTipTapHtml(legacyTermsAndConditions);

        setDoc(doc(firestore, `organisations/${orgId}/contentBlocks/${blockId}`), {
            blockType: 'terms-and-conditions',
            html,
            // 1.8.6 — T&Cs apply to BOTH quote and contract by default.
            documentTypes: ['quote', 'contract'],
            startsOnNewPage: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedByUid: user.uid,
            updatedByName: `${submitterName} (auto-migrated from legacy T&Cs)`,
        })
            .then(() => {
                toast({
                    title: 'T&Cs migrated to content block',
                    description: 'Tagged for both Quote and Contract by default. You can edit / split per document or add per-brand overrides.',
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
    }, [migrated, documentType, blocksLoading, blocks, legacyTermsAndConditions, user, userProfile, firestore, orgId, toast]);

    /**
     * Map blockType → existing doc for THIS document type.
     * 1.8.6 — when multiple docs share the same blockType (one tagged
     * 'quote', another tagged 'contract'), we want the one matching
     * the current sub-tab. Most recently updated wins on ties (e.g.
     * a block tagged ['quote','contract'] appears in both tabs).
     */
    const blockByType = useMemo(() => {
        const m = new Map<string, ContentBlock>();
        for (const b of blocks ?? []) {
            if (!b.blockType) continue;
            if (!blockBelongsTo(b, documentType)) continue;
            const existing = m.get(b.blockType);
            const aTime = (b.updatedAt as any)?.toMillis?.() ?? 0;
            const eTime = (existing?.updatedAt as any)?.toMillis?.() ?? 0;
            if (!existing || aTime > eTime) m.set(b.blockType, b);
        }
        return m;
    }, [blocks, documentType]);

    const selectedBlock = blockByType.get(selectedBlockType);

    return (
        <div className="grid gap-5 lg:grid-cols-[280px,1fr]">
            <ContentBlockList
                selectedBlockType={selectedBlockType}
                onSelect={setSelectedBlockType}
                blockByType={blockByType}
                loading={blocksLoading}
            />
            <ContentBlockDetail
                orgId={orgId}
                documentType={documentType}
                blockType={selectedBlockType}
                block={selectedBlock}
                allBlocks={blocks ?? null}
                enabledModuleSubscriptions={enabledModuleSubscriptions}
                organisationName={organisationName}
                primaryLogoUrl={primaryLogoUrl}
                secondaryLogoUrl={secondaryLogoUrl}
            />
        </div>
    );
}
