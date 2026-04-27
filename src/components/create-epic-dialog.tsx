'use client';

/**
 * Single-purpose CreateEpicDialog (v1.6).
 *
 * Replaces the bulky Manage Epics dialog from earlier — the Backlog
 * tab now hosts editing inline (or directly via Firestore docs), and
 * this dialog only needs to handle "create one new epic" coming from
 * the "+ New Epic" button.
 */

import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EpicColor } from '@/components/feature-tracking-board';

const COLORS: ReadonlyArray<{ key: EpicColor; bg: string }> = [
    { key: 'blue',    bg: 'bg-blue-500' },
    { key: 'amber',   bg: 'bg-amber-500' },
    { key: 'violet',  bg: 'bg-violet-500' },
    { key: 'emerald', bg: 'bg-emerald-500' },
    { key: 'rose',    bg: 'bg-rose-500' },
    { key: 'indigo',  bg: 'bg-indigo-500' },
    { key: 'slate',   bg: 'bg-slate-500' },
];

export function CreateEpicDialog({
    open,
    onOpenChange,
    nextOrder,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    nextOrder: number;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [shortLabel, setShortLabel] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState<EpicColor>('blue');
    const [busy, setBusy] = useState(false);

    function reset() {
        setTitle('');
        setShortLabel('');
        setDescription('');
        setColor('blue');
    }

    async function handleCreate() {
        if (title.trim().length < 3) {
            toast({ variant: 'destructive', title: 'Title required', description: 'Min 3 characters.' });
            return;
        }
        setBusy(true);
        try {
            await addDoc(collection(firestore, 'epics'), {
                title: title.trim(),
                shortLabel: (shortLabel.trim() || title.trim()).slice(0, 24),
                description: description.trim(),
                color,
                order: nextOrder,
                status: 'planning',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Epic created', description: title.trim() });
            reset();
            onOpenChange(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Create failed', description: e?.message ?? 'See console.' });
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-blue-600" />
                        New Epic
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Top-level grouping for features. Used as a column on the Roadmap and a section on the Backlog.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Title</Label>
                        <Input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Inventory Management"
                            className="h-9 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Short label <span className="text-slate-400 normal-case">(used as a chip — ≤24 chars)</span>
                        </Label>
                        <Input
                            value={shortLabel}
                            onChange={(e) => setShortLabel(e.target.value)}
                            placeholder="e.g. Inventory"
                            maxLength={24}
                            className="h-9 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Description <span className="text-slate-400 normal-case">(optional)</span>
                        </Label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="One-line summary of what this epic covers."
                            className="h-9 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Colour</Label>
                        <div className="flex items-center gap-2">
                            {COLORS.map(c => (
                                <button
                                    key={c.key}
                                    type="button"
                                    onClick={() => setColor(c.key)}
                                    className={cn(
                                        'h-7 w-7 rounded-full transition-all',
                                        c.bg,
                                        color === c.key
                                            ? 'ring-2 ring-offset-2 ring-slate-900 scale-110'
                                            : 'opacity-60 hover:opacity-100',
                                    )}
                                    title={c.key}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={busy || title.trim().length < 3} className="gap-2">
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Create epic
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
