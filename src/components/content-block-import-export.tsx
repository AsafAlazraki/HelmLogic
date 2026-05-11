'use client';

/**
 * Content Block Import / Export (v1.8 — story 1.8.8).
 *
 * Export: serialises every org-default content block to a single JSON
 * file the operator can save, version-control, or share between orgs
 * (e.g. dealer group rolling out shared T&Cs to multiple sub-orgs).
 *
 * Import: reverse — accepts a JSON file matching the export shape and
 * upserts by `blockType` natural key (per the v1.4 import-hygiene
 * lesson — never clear-and-replace operator-authored content).
 *
 * Out of scope (deferred to v1.9):
 *   - Brand overrides (organisations/{orgId}/contentBlocks/{blockId}/brandOverrides)
 *     — vendor-tied, not portable across orgs without an explicit mapping.
 *   - Versions subcollection — the import creates a fresh version per
 *     touched block via the manager's normal save path; it does NOT
 *     replay imported version history.
 *   - Per-quote contentOverrides — quote-tied, not org-portable.
 */

import { useRef, useState } from 'react';
import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import {
    BLOCK_TYPES,
    BLOCK_TYPE_LABEL,
    type BlockType,
    type ContentBlock,
    type DocumentType,
} from '@/lib/content-blocks';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Download, FileJson, Loader2, Upload } from 'lucide-react';

interface Props {
    orgId: string;
}

/** Shape of one entry in the export JSON. Stable schema —
 *  bumping requires a versionString change. */
interface ExportEntry {
    blockType: BlockType;
    html: string;
    subHeader?: string | null;
    documentTypes?: DocumentType[];
    isLockedForQuotes?: boolean;
    startsOnNewPage?: boolean;
}

interface ExportFile {
    schemaVersion: 'helmlogic-content-blocks-v1';
    exportedAt: string;
    orgId: string;
    blocks: ExportEntry[];
}

const VALID_BLOCK_TYPES = new Set<BlockType>(BLOCK_TYPES);

export function ContentBlockImportExport({ orgId }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [exporting, setExporting] = useState(false);
    const [parsedImport, setParsedImport] = useState<ExportFile | null>(null);
    const [importing, setImporting] = useState(false);

    async function handleExport() {
        setExporting(true);
        try {
            const snap = await getDocs(collection(firestore, `organisations/${orgId}/contentBlocks`));
            const blocks: ExportEntry[] = [];
            for (const d of snap.docs) {
                const b = d.data() as ContentBlock;
                if (!b.blockType || !VALID_BLOCK_TYPES.has(b.blockType)) continue;
                blocks.push({
                    blockType: b.blockType,
                    html: b.html ?? '',
                    subHeader: b.subHeader ?? null,
                    documentTypes: b.documentTypes ?? ['quote'],
                    isLockedForQuotes: !!b.isLockedForQuotes,
                    startsOnNewPage: !!b.startsOnNewPage,
                });
            }

            const file: ExportFile = {
                schemaVersion: 'helmlogic-content-blocks-v1',
                exportedAt: new Date().toISOString(),
                orgId,
                blocks,
            };

            const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ts = new Date().toISOString().slice(0, 10);
            a.download = `content-blocks-${orgId}-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            toast({
                title: 'Exported',
                description: `${blocks.length} block${blocks.length === 1 ? '' : 's'} written to JSON.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Export failed', description: e?.message ?? 'See console.' });
            console.error('[content-blocks export]', e);
        } finally {
            setExporting(false);
        }
    }

    function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        // Reset input so the SAME file can be re-selected after a cancel.
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result as string);
                if (parsed?.schemaVersion !== 'helmlogic-content-blocks-v1') {
                    throw new Error(`Unrecognised schemaVersion: ${parsed?.schemaVersion ?? 'missing'}`);
                }
                if (!Array.isArray(parsed?.blocks)) {
                    throw new Error('Missing or invalid "blocks" array.');
                }
                setParsedImport(parsed as ExportFile);
            } catch (err: any) {
                toast({
                    variant: 'destructive',
                    title: 'Invalid file',
                    description: err?.message ?? 'JSON could not be parsed.',
                });
                console.error('[content-blocks import parse]', err);
            }
        };
        reader.onerror = () => {
            toast({ variant: 'destructive', title: 'Read failed', description: 'Could not read file.' });
        };
        reader.readAsText(file);
    }

    /** Pre-import diff: how many blockTypes already exist vs. would be created. */
    async function computeImportPreview(file: ExportFile) {
        const snap = await getDocs(collection(firestore, `organisations/${orgId}/contentBlocks`));
        const existingByType = new Map<BlockType, string>(); // blockType -> docId
        for (const d of snap.docs) {
            const b = d.data() as ContentBlock;
            if (!b.blockType || !VALID_BLOCK_TYPES.has(b.blockType)) continue;
            // If duplicates exist for the same blockType, last one wins
            // (the resolver picks most-recent-updatedAt anyway; we just
            // need ANY id so the upsert hits an existing doc).
            existingByType.set(b.blockType, d.id);
        }
        return existingByType;
    }

    async function handleConfirmImport() {
        if (!parsedImport || !user) return;
        setImporting(true);
        try {
            const existingByType = await computeImportPreview(parsedImport);
            const submitterName =
                (user as any).displayName || user.email || 'Someone';

            let updated = 0;
            let created = 0;
            let skipped = 0;

            for (const entry of parsedImport.blocks) {
                if (!entry.blockType || !VALID_BLOCK_TYPES.has(entry.blockType)) {
                    skipped++;
                    continue;
                }
                const existingId = existingByType.get(entry.blockType);
                const blockId = existingId ?? doc(collection(firestore, `organisations/${orgId}/contentBlocks`)).id;
                const blockRef = doc(firestore, `organisations/${orgId}/contentBlocks/${blockId}`);
                await setDoc(
                    blockRef,
                    {
                        blockType: entry.blockType,
                        html: entry.html ?? '',
                        subHeader: entry.subHeader ?? null,
                        documentTypes: entry.documentTypes ?? ['quote'],
                        isLockedForQuotes: !!entry.isLockedForQuotes,
                        startsOnNewPage: !!entry.startsOnNewPage,
                        updatedAt: serverTimestamp(),
                        updatedByUid: user.uid,
                        updatedByName: `${submitterName} (imported)`,
                        ...(existingId ? {} : { createdAt: serverTimestamp() }),
                    },
                    { merge: true },
                );
                if (existingId) updated++; else created++;
            }

            toast({
                title: 'Import complete',
                description: `${updated} updated · ${created} created${skipped ? ` · ${skipped} skipped (unknown blockType)` : ''}`,
            });
            setParsedImport(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Import failed', description: e?.message ?? 'See console.' });
            console.error('[content-blocks import]', e);
        } finally {
            setImporting(false);
        }
    }

    return (
        <>
            <div className="flex items-center justify-end gap-2 mb-3">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    disabled={exporting}
                    className="gap-1.5 h-8 text-[11px]"
                >
                    {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {exporting ? 'Exporting…' : 'Export JSON'}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    className="gap-1.5 h-8 text-[11px]"
                >
                    <Upload className="h-3.5 w-3.5" />
                    Import JSON
                </Button>
                {/* Native input — shadcn Input wrapper breaks the file dialog */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={handleFilePicked}
                />
            </div>

            {/* Confirm popup per CONVENTIONS.md popups-for-confirmations rule. */}
            <AlertDialog open={!!parsedImport} onOpenChange={(v) => { if (!v) setParsedImport(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <FileJson className="h-4 w-4 text-primary" />
                            Import content blocks?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                                <p>
                                    This file contains <strong>{parsedImport?.blocks.length ?? 0}</strong> block
                                    {parsedImport?.blocks.length === 1 ? '' : 's'}. Each will be matched to your
                                    existing blocks by <code className="bg-slate-100 px-1 rounded">blockType</code>:
                                </p>
                                <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5 max-h-40 overflow-y-auto pl-2">
                                    {parsedImport?.blocks.map((b, i) => (
                                        <li key={i}>
                                            {BLOCK_TYPE_LABEL[b.blockType] ?? b.blockType}
                                            {b.isLockedForQuotes && <span className="text-amber-600"> · locked</span>}
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-slate-500 pt-1">
                                    Matching blocks will be <strong>updated</strong>, missing blocks will be{' '}
                                    <strong>created</strong>. Brand overrides and version history are not touched.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmImport} disabled={importing} className="gap-1.5">
                            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {importing ? 'Importing…' : 'Yes, import'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
