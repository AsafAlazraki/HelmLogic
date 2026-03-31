
'use client';

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Pencil, Check, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ModuleDealerFitManagerProps {
    moduleId: string;
    categories: string[];
}

export function ModuleDealerFitManager({ moduleId, categories }: ModuleDealerFitManagerProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [newCategory, setNewCategory] = useState('');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    const moduleRef = useMemoFirebase(
        () => doc(firestore, 'modules', moduleId),
        [firestore, moduleId]
    );

    const handleAddCategory = async () => {
        const trimmed = newCategory.trim();
        if (!trimmed) return;

        const isDuplicate = categories.some(
            (c) => c.toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast({ variant: 'destructive', title: 'Category already exists' });
            return;
        }

        try {
            await updateDoc(moduleRef, { moduleDealerFitCategories: [...categories, trimmed] });
            setNewCategory('');
            toast({ title: 'Category added' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Failed to add category' });
        }
    };

    const handleRemoveCategory = async (categoryToRemove: string) => {
        try {
            const updated = categories.filter((c) => c !== categoryToRemove);
            await updateDoc(moduleRef, { moduleDealerFitCategories: updated.length > 0 ? updated : [] });
            toast({ title: 'Category removed' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Failed to remove category' });
        }
    };

    const startRename = (index: number, currentName: string) => {
        setEditingIndex(index);
        setEditValue(currentName);
    };

    const saveRename = async () => {
        if (editingIndex === null || !editValue.trim()) return;

        const trimmed = editValue.trim();

        if (categories.some((c, i) => i !== editingIndex && c.toLowerCase() === trimmed.toLowerCase())) {
            toast({ variant: 'destructive', title: 'Category already exists' });
            return;
        }

        try {
            const updated = [...categories];
            updated[editingIndex] = trimmed;
            await updateDoc(moduleRef, { moduleDealerFitCategories: updated });
            setEditingIndex(null);
            toast({ title: 'Category renamed' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Failed to rename category' });
        }
    };

    const cancelRename = () => {
        setEditingIndex(null);
        setEditValue('');
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <CardTitle className="text-xs font-bold">Dealer Fit Categories</CardTitle>
                <CardDescription className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                    Define categories for dealer fit options
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Category List */}
                {categories.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4 italic">
                        No categories defined yet
                    </p>
                ) : (
                    <div className="space-y-1">
                        {categories.map((category, index) => (
                            <div
                                key={`${category}-${index}`}
                                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50"
                            >
                                {editingIndex === index ? (
                                    <div className="flex items-center gap-2 flex-1 mr-2">
                                        <Input
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            className="text-xs rounded-xl border-2 h-8"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    saveRename();
                                                } else if (e.key === 'Escape') {
                                                    cancelRename();
                                                }
                                            }}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-lg"
                                            onClick={saveRename}
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="text-xs font-semibold">{category}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 rounded-lg"
                                                onClick={() => startRename(index, category)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 rounded-lg text-destructive"
                                                onClick={() => handleRemoveCategory(category)}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Category Input */}
                <div className="flex items-center gap-2 pt-2">
                    <Input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="Enter category name..."
                        className="text-xs rounded-xl border-2"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCategory();
                            }
                        }}
                    />
                    <Button
                        onClick={handleAddCategory}
                        className="rounded-xl text-xs"
                        disabled={!newCategory.trim()}
                    >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
