
'use client';

/**
 * SavedFiltersBar (v1.18 — Story 3.10.4).
 *
 * Saved filter views for Catalog Manager's cross-tab search. Each saved
 * filter is a named string query the operator can pin and recall with
 * one click. Pins live on the user profile doc as an array field
 * (users/{uid}.savedCatalogFilters: { id, name, query, createdAt }[]).
 * No new Firestore collection on purpose — keeps the rules-deploy gate
 * out of this story so we can ship without a republish.
 *
 * UX: chip row above the search input. Click a chip to apply, X to
 * delete. "Save current" button only renders when the search is
 * non-empty, opens a name-it dialog.
 */

import { useState } from 'react';
import { doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Bookmark, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface SavedCatalogFilter {
    id: string;
    name: string;
    query: string;
    createdAt: number;
}

export function SavedFiltersBar({
    savedFilters,
    currentQuery,
    onApply,
}: {
    savedFilters: SavedCatalogFilter[];
    currentQuery: string;
    onApply: (query: string) => void;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [saveOpen, setSaveOpen] = useState(false);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    const trimmed = currentQuery.trim();
    const canSave = trimmed.length > 0 && user != null;
    const alreadySaved = savedFilters.some(f => f.query === trimmed);

    const handleSave = async () => {
        if (!user || !name.trim() || !trimmed) return;
        setSaving(true);
        try {
            const ref = doc(firestore, 'users', user.uid);
            const filter: SavedCatalogFilter = {
                id: `cf_${Math.floor(performance.now())}_${Math.floor(Math.random() * 1000)}`,
                name: name.trim().slice(0, 50),
                query: trimmed,
                createdAt: Date.now(),
            };
            await updateDoc(ref, { savedCatalogFilters: arrayUnion(filter) });
            toast({ title: 'Filter saved', description: filter.name });
            setSaveOpen(false);
            setName('');
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (filter: SavedCatalogFilter) => {
        if (!user) return;
        try {
            await updateDoc(doc(firestore, 'users', user.uid), {
                savedCatalogFilters: arrayRemove(filter),
            });
            toast({ title: 'Filter removed', description: filter.name });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Remove failed', description: err?.message ?? String(err) });
        }
    };

    if (savedFilters.length === 0 && !canSave) return null;

    return (
        <div data-testid="saved-filters-bar" className="flex items-center gap-1.5 flex-wrap pt-1">
            {savedFilters.map(filter => {
                const active = filter.query === trimmed;
                return (
                    <Badge
                        key={filter.id}
                        variant={active ? 'default' : 'outline'}
                        className="text-[10px] font-bold cursor-pointer hover:bg-primary/10 group pr-1"
                        onClick={() => onApply(filter.query)}
                    >
                        <Bookmark className="h-2.5 w-2.5 mr-1" />
                        {filter.name}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDelete(filter); }}
                            className="ml-1 opacity-50 hover:opacity-100 hover:text-destructive transition-opacity"
                            aria-label={`Delete saved filter ${filter.name}`}
                        >
                            <X className="h-2.5 w-2.5" />
                        </button>
                    </Badge>
                );
            })}
            {canSave && !alreadySaved && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSaveOpen(true)}
                    className="h-6 px-2 text-[10px] font-bold rounded-full"
                >
                    <Bookmark className="h-2.5 w-2.5 mr-1" /> Save "{trimmed}"
                </Button>
            )}

            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Save filter</DialogTitle>
                        <DialogDescription className="text-xs">
                            Pin this filter so you can re-apply it with one click. Saved on
                            your profile, so other users won't see it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Query</p>
                        <p className="text-xs font-mono p-2 bg-muted rounded">{trimmed}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-3">Name</p>
                        <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Yamaha F70 sweep"
                            maxLength={50}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || !name.trim()}>
                            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
