'use client';

/**
 * Epic Management Dialog (v1.6).
 *
 * Bare-bones admin UI for the new `epics/{id}` collection: list every
 * epic with inline edit (title / shortLabel / colour / order), add a
 * new one, soft-delete an existing one. Drag-to-reorder is deferred
 * to a later release — the order field is a number input for now.
 *
 * Opened from a button in the board banner. Only visible to non-sub-
 * dealers (whole page is gated already).
 */

import { useEffect, useMemo, useState } from 'react';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, Layers, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDoc } from '@/firebase/firestore/use-doc';
import type { EpicDoc, EpicColor } from '@/components/feature-tracking-board';
import { seedMvpPlan } from '@/lib/mvp-plan-seed';

const COLOR_PALETTE: ReadonlyArray<{ key: EpicColor; ring: string; bg: string; text: string }> = [
    { key: 'blue',    ring: 'ring-blue-500',    bg: 'bg-blue-500',    text: 'text-blue-700' },
    { key: 'amber',   ring: 'ring-amber-500',   bg: 'bg-amber-500',   text: 'text-amber-700' },
    { key: 'violet',  ring: 'ring-violet-500',  bg: 'bg-violet-500',  text: 'text-violet-700' },
    { key: 'emerald', ring: 'ring-emerald-500', bg: 'bg-emerald-500', text: 'text-emerald-700' },
    { key: 'rose',    ring: 'ring-rose-500',    bg: 'bg-rose-500',    text: 'text-rose-700' },
    { key: 'indigo',  ring: 'ring-indigo-500',  bg: 'bg-indigo-500',  text: 'text-indigo-700' },
    { key: 'slate',   ring: 'ring-slate-500',   bg: 'bg-slate-500',   text: 'text-slate-700' },
];

export function EpicManagementDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const epicsRef = useMemoFirebase(
        () => collection(firestore, 'epics'),
        [firestore],
    );
    const { data: epics, isLoading } = useCollection<EpicDoc>(epicsRef);

    const sortedEpics = useMemo(() => {
        return [...(epics ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }, [epics]);

    const [creating, setCreating] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [draftTitle, setDraftTitle] = useState('');
    const [draftShort, setDraftShort] = useState('');
    const [draftColor, setDraftColor] = useState<EpicColor>('blue');

    // For the seeder we need the user's display name as the submitter.
    const { user } = useUser();
    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);

    async function handleSeedMvpPlan() {
        if (!confirm('Seed the v1.6 MVP plan? Creates 5 Epics + 22 features from the stakeholder spec. Idempotent — re-running is safe and skips existing items.')) return;
        setSeeding(true);
        try {
            const submitterName = userProfile?.displayName
                || userProfile?.email
                || user?.email
                || 'MVP Seed';
            const summary = await seedMvpPlan(firestore, user?.uid, submitterName);
            toast({
                title: 'MVP plan seeded',
                description: `Epics: ${summary.epicsCreated} created, ${summary.epicsSkipped} skipped · Features: ${summary.featuresCreated} created, ${summary.featuresSkipped} skipped.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Seed failed', description: e?.message ?? 'See console.' });
        } finally {
            setSeeding(false);
        }
    }

    function reset() {
        setDraftTitle('');
        setDraftShort('');
        setDraftColor('blue');
    }

    async function handleCreate() {
        if (draftTitle.trim().length < 3) {
            toast({ variant: 'destructive', title: 'Title required', description: 'Min 3 characters.' });
            return;
        }
        setCreating(true);
        try {
            const nextOrder = sortedEpics.length > 0
                ? (sortedEpics[sortedEpics.length - 1].order ?? 0) + 100
                : 100;
            await addDoc(collection(firestore, 'epics'), {
                title: draftTitle.trim(),
                shortLabel: (draftShort.trim() || draftTitle.trim()).slice(0, 24),
                color: draftColor,
                order: nextOrder,
                status: 'planning',
                description: '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Epic created' });
            reset();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Create failed', description: e?.message ?? 'See console.' });
        } finally {
            setCreating(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-3 border-b">
                    <DialogTitle className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-blue-600" />
                        Manage Epics
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Top-level groupings for features. Used as swim lanes on the Roadmap and as a "group by" mode on the Board.
                    </DialogDescription>
                </DialogHeader>

                <div className="feature-scroll px-6 py-4 space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto">
                    {/* MVP plan seeder — one-click bootstrap of the 5 stakeholder epics + 22 features. Idempotent. */}
                    <div className="rounded-md border border-blue-100 bg-blue-50/40 px-3 py-2.5 flex items-center gap-3">
                        <Sparkles className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800">Seed MVP plan</p>
                            <p className="text-[10px] text-slate-500">
                                Bootstraps 5 epics + 22 user-story features from the stakeholder spec into v1.7 → v2.0. Idempotent — safe to re-run.
                            </p>
                        </div>
                        <Button
                            size="sm"
                            onClick={handleSeedMvpPlan}
                            disabled={seeding}
                            className="gap-1.5 shrink-0"
                        >
                            {seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            Seed
                        </Button>
                    </div>

                    {/* Existing epics */}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                    ) : sortedEpics.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-4">
                            No epics yet. Create your first below.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {sortedEpics.map(e => (
                                <EpicRow key={e.id} epic={e} />
                            ))}
                        </div>
                    )}

                    {/* Add new */}
                    <div className="pt-3 border-t space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Add new epic
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Title</Label>
                                <Input
                                    value={draftTitle}
                                    onChange={(e) => setDraftTitle(e.target.value)}
                                    placeholder="e.g. Guided Configuration & Quote Creation"
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                                    Short label <span className="text-slate-400 normal-case">(swim-lane chip)</span>
                                </Label>
                                <Input
                                    value={draftShort}
                                    onChange={(e) => setDraftShort(e.target.value)}
                                    placeholder="e.g. Guided Config"
                                    maxLength={24}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wider text-slate-500">Colour</Label>
                            <ColorSwatchPicker value={draftColor} onChange={setDraftColor} />
                        </div>
                        <div className="flex justify-end">
                            <Button
                                size="sm"
                                onClick={handleCreate}
                                disabled={creating || draftTitle.trim().length < 3}
                                className="gap-2"
                            >
                                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                Create epic
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function EpicRow({ epic }: { epic: EpicDoc }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [title, setTitle] = useState(epic.title);
    const [shortLabel, setShortLabel] = useState(epic.shortLabel);
    const [order, setOrder] = useState<number>(epic.order ?? 0);
    const [color, setColor] = useState<EpicColor>(epic.color);

    // Re-sync local draft when the epic doc changes from Firestore (rare,
    // but happens if a second admin edits concurrently).
    useEffect(() => {
        setTitle(epic.title);
        setShortLabel(epic.shortLabel);
        setOrder(epic.order ?? 0);
        setColor(epic.color);
    }, [epic.title, epic.shortLabel, epic.order, epic.color]);

    const dirty = title !== epic.title
        || shortLabel !== epic.shortLabel
        || order !== (epic.order ?? 0)
        || color !== epic.color;

    async function patch(data: Record<string, any>) {
        await updateDoc(doc(firestore, 'epics', epic.id), {
            ...data,
            updatedAt: serverTimestamp(),
        });
    }

    async function save() {
        if (title.trim().length < 3) {
            toast({ variant: 'destructive', title: 'Title required', description: 'Min 3 characters.' });
            return;
        }
        try {
            await patch({
                title: title.trim(),
                shortLabel: (shortLabel.trim() || title.trim()).slice(0, 24),
                order,
                color,
            });
            toast({ title: 'Epic saved' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e?.message ?? 'See console.' });
        }
    }

    async function remove() {
        if (!confirm(`Delete epic "${epic.title}"? Features under it will become Unfiled.`)) return;
        try {
            await deleteDoc(doc(firestore, 'epics', epic.id));
            toast({ title: 'Epic deleted' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Delete failed', description: e?.message ?? 'See console.' });
        }
    }

    const swatch = COLOR_PALETTE.find(c => c.key === color) ?? COLOR_PALETTE[0];

    return (
        <div className="rounded-md border bg-white px-3 py-2.5 space-y-2">
            <div className="flex items-start gap-2">
                <div className={cn('h-9 w-1 rounded-full mt-0.5 shrink-0', swatch.bg)} />
                <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Title"
                        className="h-8 text-xs"
                    />
                    <Input
                        value={shortLabel}
                        onChange={(e) => setShortLabel(e.target.value)}
                        placeholder="Short label"
                        maxLength={24}
                        className="h-8 text-xs"
                    />
                </div>
                <button
                    type="button"
                    onClick={remove}
                    className="text-slate-300 hover:text-red-500 mt-1.5"
                    title="Delete epic"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="flex items-center gap-3 pl-3">
                <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-slate-500">Order</Label>
                    <Input
                        type="number"
                        value={order}
                        onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)}
                        className="h-7 w-16 text-xs"
                    />
                </div>
                <ColorSwatchPicker value={color} onChange={setColor} compact />
                <div className="flex-1" />
                {dirty && (
                    <Button size="sm" className="h-7 text-xs" onClick={save}>
                        Save
                    </Button>
                )}
            </div>
        </div>
    );
}

function ColorSwatchPicker({
    value,
    onChange,
    compact = false,
}: {
    value: EpicColor;
    onChange: (v: EpicColor) => void;
    compact?: boolean;
}) {
    return (
        <div className="flex items-center gap-1.5">
            {COLOR_PALETTE.map(c => (
                <button
                    key={c.key}
                    type="button"
                    onClick={() => onChange(c.key)}
                    className={cn(
                        'rounded-full transition-all',
                        compact ? 'h-4 w-4' : 'h-6 w-6',
                        c.bg,
                        value === c.key
                            ? 'ring-2 ring-offset-2 ring-slate-900 scale-110'
                            : 'opacity-60 hover:opacity-100',
                    )}
                    title={c.key}
                    aria-label={`Set colour ${c.key}`}
                />
            ))}
        </div>
    );
}
