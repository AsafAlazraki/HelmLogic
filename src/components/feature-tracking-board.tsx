'use client';

/**
 * Feature Tracking board — v1.5.
 *
 * Stage 2 (this commit): real Kanban. 5 columns, live subscription to
 * `features/*`, cards render title / type icon / priority / release /
 * tags / vote count.
 *
 * Later stages add:
 *   3. Drag-and-drop reorder within column + move between columns
 *   4. Create-feature dialog (TipTap + image upload + acceptance criteria)
 *   5. Detail sheet (full description, comments thread, metadata editors)
 *   6. Per-column sort toggle (manual / votes / date)
 */

import { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Lightbulb,
    Plus,
    Bug,
    Sparkles,
    Wrench,
    ThumbsUp,
    Tag as TagIcon,
    MessageSquare,
    X,
    Loader2,
    CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FeatureRichTextEditor } from '@/components/feature-rich-text-editor';
import { FeatureImageUploader } from '@/components/feature-image-uploader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeatureStatus =
    | 'submitted'
    | 'under-review'
    | 'planned'
    | 'in-progress'
    | 'shipped';

export type FeaturePriority =
    | 'critical'
    | 'high'
    | 'medium'
    | 'low'
    | 'nice-to-have';

export type FeatureType = 'feature' | 'bug' | 'improvement';

export interface FeatureDoc {
    id: string;
    title: string;
    /** TipTap JSON (populated by the create dialog in stage 4). */
    description?: string;
    type?: FeatureType;
    status?: FeatureStatus;
    priority?: FeaturePriority;
    targetRelease?: string | null;
    tags?: string[];
    voteIds?: string[];
    order?: number;
    acceptanceCriteria?: string[];
    imageUrls?: string[];
    submitterId?: string;
    submitterName?: string;
    createdAt?: any;
    updatedAt?: any;
    commentCount?: number;
}

// ---------------------------------------------------------------------------
// Column metadata
// ---------------------------------------------------------------------------

const COLUMNS: Array<{
    key: FeatureStatus;
    label: string;
    accent: string;       // ring + header accent
    badge: string;        // count badge
}> = [
    {
        key: 'submitted',
        label: 'Submitted',
        accent: 'border-slate-300',
        badge: 'bg-slate-100 text-slate-700',
    },
    {
        key: 'under-review',
        label: 'Under Review',
        accent: 'border-amber-300',
        badge: 'bg-amber-100 text-amber-800',
    },
    {
        key: 'planned',
        label: 'Planned',
        accent: 'border-blue-300',
        badge: 'bg-blue-100 text-blue-800',
    },
    {
        key: 'in-progress',
        label: 'In Progress',
        accent: 'border-violet-300',
        badge: 'bg-violet-100 text-violet-800',
    },
    {
        key: 'shipped',
        label: 'Shipped',
        accent: 'border-emerald-300',
        badge: 'bg-emerald-100 text-emerald-800',
    },
];

const PRIORITY_STYLES: Record<FeaturePriority, { label: string; className: string }> = {
    critical:       { label: 'Critical',     className: 'bg-red-100 text-red-700 border-red-200' },
    high:           { label: 'High',         className: 'bg-orange-100 text-orange-700 border-orange-200' },
    medium:         { label: 'Medium',       className: 'bg-amber-100 text-amber-700 border-amber-200' },
    low:            { label: 'Low',          className: 'bg-slate-100 text-slate-600 border-slate-200' },
    'nice-to-have': { label: 'Nice to have', className: 'bg-slate-50 text-slate-500 border-slate-100' },
};

function TypeIcon({ type }: { type?: FeatureType }) {
    switch (type) {
        case 'bug':
            return <Bug className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
        case 'improvement':
            return <Wrench className="h-3.5 w-3.5 text-indigo-500 shrink-0" />;
        case 'feature':
        default:
            return <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    }
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function FeatureTrackingBoard() {
    const firestore = useFirestore();
    const { user } = useUser();
    const [createOpen, setCreateOpen] = useState(false);

    const featuresQuery = useMemoFirebase(
        () => collection(firestore, 'features'),
        [firestore],
    );
    const { data: features, isLoading } = useCollection<FeatureDoc>(featuresQuery);

    const byStatus = useMemo(() => {
        const groups: Record<FeatureStatus, FeatureDoc[]> = {
            submitted: [],
            'under-review': [],
            planned: [],
            'in-progress': [],
            shipped: [],
        };
        for (const f of features || []) {
            const s = (f.status || 'submitted') as FeatureStatus;
            if (groups[s]) groups[s].push(f);
            else groups.submitted.push(f);
        }
        // Sort each column by order ASC (manual drag position).
        // `order` is written by drag-drop (stage 3); until then we fall
        // back to createdAt DESC so the newest bubbles to the top.
        for (const key of Object.keys(groups) as FeatureStatus[]) {
            groups[key].sort((a, b) => {
                if (a.order != null && b.order != null) return a.order - b.order;
                const at = a.createdAt?.toMillis?.() ?? 0;
                const bt = b.createdAt?.toMillis?.() ?? 0;
                return bt - at;
            });
        }
        return groups;
    }, [features]);

    const total = features?.length ?? 0;

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 shrink-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
                            <Lightbulb className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Feature Tracking</h1>
                            <p className="text-sm text-blue-50">
                                {isLoading
                                    ? 'Loading feature requests…'
                                    : total === 0
                                        ? 'No requests yet — be the first.'
                                        : `${total} feature request${total === 1 ? '' : 's'} across the team.`}
                            </p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        className="bg-white text-blue-700 hover:bg-blue-50 gap-2 shadow-sm"
                        onClick={() => setCreateOpen(true)}
                    >
                        <Plus className="h-4 w-4" />
                        New Feature
                    </Button>
                </div>
            </div>

            {/* Board */}
            <div className="flex-1 min-h-0 overflow-auto">
                <div className="p-6 h-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 min-h-full">
                        {COLUMNS.map(col => (
                            <ColumnView
                                key={col.key}
                                column={col}
                                features={byStatus[col.key]}
                                currentUserId={user?.uid}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <CreateFeatureDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                defaultOrderForColumn={(byStatus.submitted[0]?.order ?? 0) - 10}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function ColumnView({
    column,
    features,
    currentUserId,
}: {
    column: typeof COLUMNS[number];
    features: FeatureDoc[];
    currentUserId?: string;
}) {
    return (
        <div className="flex flex-col min-h-0">
            <div className={cn(
                'sticky top-0 z-10 rounded-t-xl border-t-2 border-x border-b bg-white',
                'flex items-center justify-between gap-2 px-3 py-2.5',
                column.accent,
            )}>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                    {column.label}
                </h3>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', column.badge)}>
                    {features.length}
                </span>
            </div>
            <div className="flex-1 space-y-2 border-x border-b rounded-b-xl bg-slate-50/70 p-2 min-h-[200px]">
                {features.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">
                        Nothing here yet.
                    </p>
                ) : (
                    features.map(f => (
                        <FeatureCard
                            key={f.id}
                            feature={f}
                            currentUserId={currentUserId}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function FeatureCard({
    feature,
    currentUserId,
}: {
    feature: FeatureDoc;
    currentUserId?: string;
}) {
    const voteIds = feature.voteIds ?? [];
    const voteCount = voteIds.length;
    const userVoted = currentUserId ? voteIds.includes(currentUserId) : false;
    const priority = feature.priority ? PRIORITY_STYLES[feature.priority] : null;
    const tags = feature.tags ?? [];
    const visibleTags = tags.slice(0, 3);
    const hiddenTagCount = Math.max(0, tags.length - visibleTags.length);
    const commentCount = feature.commentCount ?? 0;

    return (
        <div
            role="button"
            tabIndex={0}
            className="bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all p-3 space-y-2 cursor-pointer"
            title="Open detail (stage 5)"
        >
            <div className="flex items-start gap-2">
                <TypeIcon type={feature.type} />
                <p className="text-xs font-semibold text-slate-800 leading-snug flex-1 min-w-0">
                    {feature.title || 'Untitled'}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {priority && (
                    <Badge variant="outline" className={cn('text-[9px] font-bold border', priority.className)}>
                        {priority.label}
                    </Badge>
                )}
                {feature.targetRelease && (
                    <Badge variant="outline" className="text-[9px] font-bold text-indigo-700 border-indigo-200 bg-indigo-50">
                        {feature.targetRelease}
                    </Badge>
                )}
                {visibleTags.map(t => (
                    <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[9px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5"
                    >
                        <TagIcon className="h-2.5 w-2.5" /> {t}
                    </span>
                ))}
                {hiddenTagCount > 0 && (
                    <span className="text-[9px] text-slate-400">+{hiddenTagCount}</span>
                )}
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t">
                <button
                    type="button"
                    className={cn(
                        'flex items-center gap-1 text-[10px] font-semibold transition-colors',
                        userVoted
                            ? 'text-blue-600'
                            : 'text-slate-500 hover:text-blue-600',
                    )}
                    title="Voting arrives in stage 5"
                    disabled
                >
                    <ThumbsUp className={cn('h-3 w-3', userVoted && 'fill-blue-600')} />
                    {voteCount}
                </button>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    {commentCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {commentCount}
                        </span>
                    )}
                    {feature.submitterName && (
                        <span className="truncate max-w-[90px]" title={feature.submitterName}>
                            {feature.submitterName}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Create Feature Dialog
// ---------------------------------------------------------------------------

function CreateFeatureDialog({
    open,
    onOpenChange,
    defaultOrderForColumn,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Order value that places this new feature at the top of Submitted. */
    defaultOrderForColumn: number;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const { toast } = useToast();

    // Generate a client-side doc ID so the image uploader can
    // write to `features/{featureId}/...` before the doc is saved.
    const [featureId] = useState(() => doc(collection(firestore, 'features')).id);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<FeatureType>('feature');
    const [priority, setPriority] = useState<FeaturePriority>('medium');
    const [targetRelease, setTargetRelease] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [tagDraft, setTagDraft] = useState('');
    const [acceptance, setAcceptance] = useState<string[]>([]);
    const [acceptanceDraft, setAcceptanceDraft] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    function reset() {
        setTitle('');
        setDescription('');
        setType('feature');
        setPriority('medium');
        setTargetRelease('');
        setTags([]);
        setTagDraft('');
        setAcceptance([]);
        setAcceptanceDraft('');
        setImages([]);
    }

    function addTag() {
        const t = tagDraft.trim().toLowerCase();
        if (!t) return;
        if (tags.includes(t)) { setTagDraft(''); return; }
        setTags([...tags, t]);
        setTagDraft('');
    }
    function removeTag(t: string) {
        setTags(tags.filter(x => x !== t));
    }

    function addAcceptance() {
        const a = acceptanceDraft.trim();
        if (!a) return;
        setAcceptance([...acceptance, a]);
        setAcceptanceDraft('');
    }
    function removeAcceptance(i: number) {
        setAcceptance(acceptance.filter((_, idx) => idx !== i));
    }

    async function handleSubmit() {
        if (title.trim().length < 3) {
            toast({ variant: 'destructive', title: 'Title required', description: 'Min 3 characters.' });
            return;
        }
        if (!user) {
            toast({ variant: 'destructive', title: 'Not signed in' });
            return;
        }
        setSubmitting(true);
        try {
            await setDoc(doc(firestore, 'features', featureId), {
                title: title.trim(),
                description: description || '',
                type,
                status: 'submitted',
                priority,
                targetRelease: targetRelease.trim() || null,
                tags,
                voteIds: [],
                order: defaultOrderForColumn ?? 0,
                acceptanceCriteria: acceptance,
                imageUrls: images,
                commentCount: 0,
                submitterId: user.uid,
                submitterName: userProfile?.displayName || userProfile?.email || user.email || 'Someone',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Feature submitted', description: `"${title.trim()}" posted to the board.` });
            reset();
            onOpenChange(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to submit', description: e?.message ?? 'See console.' });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-blue-600" />
                        New Feature Request
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Share the idea. Anyone on the team can vote and comment.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[calc(100vh-220px)]">
                    <div className="px-6 py-2 space-y-4">
                        {/* Title */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Title</Label>
                            <Input
                                autoFocus
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Short, specific summary"
                                className="h-9 text-sm"
                            />
                        </div>

                        {/* Type + Priority */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Type</Label>
                                <Select value={type} onValueChange={(v) => setType(v as FeatureType)}>
                                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent className="z-[10000]">
                                        <SelectItem value="feature" className="text-xs">✨ Feature</SelectItem>
                                        <SelectItem value="bug" className="text-xs">🐛 Bug</SelectItem>
                                        <SelectItem value="improvement" className="text-xs">🔧 Improvement</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Priority</Label>
                                <Select value={priority} onValueChange={(v) => setPriority(v as FeaturePriority)}>
                                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent className="z-[10000]">
                                        <SelectItem value="critical" className="text-xs">Critical</SelectItem>
                                        <SelectItem value="high" className="text-xs">High</SelectItem>
                                        <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                                        <SelectItem value="low" className="text-xs">Low</SelectItem>
                                        <SelectItem value="nice-to-have" className="text-xs">Nice to have</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description</Label>
                            <FeatureRichTextEditor
                                value={description}
                                onChange={setDescription}
                                placeholder="What is it? Why does it matter? Who benefits? Use headings + lists to structure it."
                            />
                        </div>

                        {/* Acceptance Criteria */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Acceptance Criteria
                            </Label>
                            <p className="text-[10px] text-slate-400">How will we know it's done? Add bullets.</p>
                            {acceptance.length > 0 && (
                                <ul className="space-y-1">
                                    {acceptance.map((a, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5"
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                            <span className="flex-1">{a}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeAcceptance(i)}
                                                className="text-slate-400 hover:text-red-500"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="flex items-center gap-1">
                                <Input
                                    value={acceptanceDraft}
                                    onChange={(e) => setAcceptanceDraft(e.target.value)}
                                    placeholder="e.g. Trailer card shows brand + code on the quote PDF"
                                    className="h-8 text-xs"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); addAcceptance(); }
                                    }}
                                />
                                <Button size="sm" className="h-8" onClick={addAcceptance} disabled={!acceptanceDraft.trim()}>
                                    Add
                                </Button>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tags</Label>
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {tags.map(t => (
                                        <span
                                            key={t}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 rounded-full pl-2.5 pr-1 py-0.5 border border-slate-200"
                                        >
                                            {t}
                                            <button
                                                type="button"
                                                onClick={() => removeTag(t)}
                                                className="text-slate-400 hover:text-red-500 rounded-full p-0.5"
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <Input
                                    value={tagDraft}
                                    onChange={(e) => setTagDraft(e.target.value)}
                                    placeholder="Press Enter to add (e.g. trailers, pricing, mobile)"
                                    className="h-8 text-xs"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
                                    }}
                                />
                                <Button size="sm" className="h-8" onClick={addTag} disabled={!tagDraft.trim()}>
                                    Add
                                </Button>
                            </div>
                        </div>

                        {/* Target Release */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Target Release <span className="text-slate-400 normal-case">(optional)</span>
                            </Label>
                            <Input
                                value={targetRelease}
                                onChange={(e) => setTargetRelease(e.target.value)}
                                placeholder="e.g. v1.5, v1.6, Unscheduled"
                                className="h-9 text-sm"
                            />
                        </div>

                        {/* Images */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Images <span className="text-slate-400 normal-case">(optional)</span>
                            </Label>
                            <FeatureImageUploader
                                featureId={featureId}
                                value={images}
                                onChange={setImages}
                            />
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="px-6 py-3 bg-slate-50 border-t">
                    <Button
                        variant="ghost"
                        onClick={() => { reset(); onOpenChange(false); }}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || title.trim().length < 3}
                        className="gap-2"
                    >
                        {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Submit Feature
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
