
// This file is functionally identical to the other *-data-structure.tsx files.
// Any changes to the core logic for adding, editing, or deleting ranges should be
// replicated across all four files (Highfield, Jeanneau, Stacer, Stabicraft).

'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, writeBatch, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSlug } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle, Trash2, Sailboat, MoreHorizontal, Pencil, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormMessage, FormDescription } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Range {
    id: string;
    name: string;
    slug?: string;
    vendorId: string;
    imageUrl?: string;
    order?: number;
}

const rangeFormSchema = z.object({
  name: z.string().min(1, { message: 'Range name is required.' }),
  image: z.any().optional(),
});
type RangeFormData = z.infer<typeof rangeFormSchema>;

const initialRanges = ['Explorer', 'Fisher', 'Frontier', 'Supercab', 'Treker', 'Ultra Centrecab', 'Ultracab'];

export function StabicraftDataStructure({ vendorId, vendorSlugOrId }: { vendorId: string, vendorSlugOrId: string }) {
    const firestore = useFirestore();
    const storage = useStorage();
    const router = useRouter();
    const { toast } = useToast();

    const rangesQuery = useMemo(() => {
        if (!vendorId) return null;
        return query(collection(firestore, `data-warehouse/${vendorId}/ranges`));
    }, [firestore, vendorId]);
    const { data: rawRanges, loading: rangesLoading, error } = useCollection<Range>(rangesQuery);

    const [isSeeding, setIsSeeding] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [addRangeImage, setAddRangeImage] = useState<File | null>(null);
    const [addRangeImagePreview, setAddRangeImagePreview] = useState<string | null>(null);
    const [newRangeName, setNewRangeName] = useState('');

    const [editingRange, setEditingRange] = useState<Range | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    
    const [rangeToDelete, setRangeToDelete] = useState<Range | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const [isAddingOpen, setIsAddingOpen] = useState(false);

    const editForm = useForm<RangeFormData>({
      resolver: zodResolver(rangeFormSchema),
    });

    const ranges = useMemo(() => {
        if (!rawRanges) return [];
        return [...rawRanges].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    }, [rawRanges]);

    useEffect(() => {
        if (rawRanges && rawRanges.length > 0 && rawRanges.some(r => r.order === undefined)) {
            const batch = writeBatch(firestore);
            rawRanges.forEach((range, index) => {
                const rangeRef = doc(firestore, `data-warehouse/${vendorId}/ranges`, range.id);
                batch.update(rangeRef, { order: index });
            });
            batch.commit().catch(err => console.error("Failed to update order", err));
        }
    }, [rawRanges, firestore, vendorId]);

    useEffect(() => {
        if (editingRange) {
            editForm.reset({ name: editingRange.name });
        }
    }, [editingRange, editForm]);


    const handleSeedData = async () => {
        setIsSeeding(true);
        try {
            const batch = writeBatch(firestore);
            const rangesCollection = collection(firestore, `data-warehouse/${vendorId}/ranges`);

            initialRanges.forEach((rangeName, index) => {
                const newRangeRef = doc(rangesCollection);
                batch.set(newRangeRef, {
                    name: rangeName,
                    slug: createSlug(rangeName),
                    vendorId: vendorId,
                    order: index
                });
            });

            await batch.commit();
            toast({ title: 'Success', description: 'Initial Stabicraft data has been created.' });
        } catch (error) {
            console.error("Error seeding data: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not seed initial data.' });
        } finally {
            setIsSeeding(false);
        }
    };

    const handleAddRange = async () => {
        if (!newRangeName.trim() || !vendorId) return;
        setIsAdding(true);
        try {
            const rangesCollectionRef = collection(firestore, `data-warehouse/${vendorId}/ranges`);
            const newRangeRef = doc(rangesCollectionRef);
            const slug = createSlug(newRangeName);
            const data: Partial<Range> = {
                name: newRangeName,
                slug: slug,
                vendorId: vendorId,
                order: ranges.length
            };
            if (addRangeImage && storage) {
                const path = `data-warehouse/${vendorId}/ranges/${slug}/cover-${Date.now()}-${addRangeImage.name}`;
                data.imageUrl = await uploadFileToStorage(storage, addRangeImage, path);
            }
            await setDoc(newRangeRef, data);
            
            setNewRangeName('');
            setAddRangeImage(null);
            setAddRangeImagePreview(null);
            setIsAddingOpen(false);
            toast({ title: 'Range Added', description: `${newRangeName} was added successfully.` });
        } catch (error) {
            console.error('Error adding range:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not add range.' });
        } finally {
            setIsAdding(false);
        }
    };

    const handleUpdateRange = async (values: RangeFormData) => {
        if (!editingRange) return;
        try {
            const rangeDocRef = doc(firestore, `data-warehouse/${vendorId}/ranges`, editingRange.id);
            const slug = createSlug(values.name);
            const dataToUpdate: Partial<Range> = {
                name: values.name,
                slug: slug,
            };

            let imageWasUpdated = false;
            if (values.image instanceof File && storage) {
                const path = `data-warehouse/${vendorId}/ranges/${slug}/cover-${Date.now()}-${values.image.name}`;
                dataToUpdate.imageUrl = await uploadFileToStorage(storage, values.image, path);
                imageWasUpdated = true;
            }
            
            await updateDoc(rangeDocRef, dataToUpdate);
            toast({ title: 'Range Updated' });

            if (imageWasUpdated) {
                window.location.reload();
            } else {
                setIsEditDialogOpen(false);
                setEditingRange(null);
            }

        } catch (error) {
            console.error('Failed to update range:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update range.' });
        }
    };

    const handleDeleteRange = async () => {
        if (!rangeToDelete) return;
        try {
            await deleteDoc(doc(firestore, `data-warehouse/${vendorId}/ranges`, rangeToDelete.id));
            toast({ title: 'Range Deleted', description: `"${rangeToDelete.name}" has been deleted.` });
        } catch (error) {
            console.error('Failed to delete range:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete range.' });
        } finally {
            setIsDeleteDialogOpen(false);
            setRangeToDelete(null);
        }
    };

    const handleMoveRange = async (index: number, direction: 'up' | 'down') => {
        if (!ranges) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= ranges.length) return;

        const item1 = ranges[index];
        const item2 = ranges[newIndex];

        const batch = writeBatch(firestore);
        
        const item1Ref = doc(firestore, `data-warehouse/${vendorId}/ranges`, item1.id);
        batch.update(item1Ref, { order: item2.order });

        const item2Ref = doc(firestore, `data-warehouse/${vendorId}/ranges`, item2.id);
        batch.update(item2Ref, { order: item1.order });

        try {
            await batch.commit();
            toast({ title: 'Order updated' });
        } catch (error) {
            console.error("Failed to update order:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update order.' });
        }
    };

    if (rangesLoading) {
        return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <>
            <Collapsible asChild open={isAddingOpen} onOpenChange={setIsAddingOpen}>
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Stabicraft Product Ranges</CardTitle>
                                <CardDescription>Manage product ranges and models for Stabicraft boats.</CardDescription>
                            </div>
                            <CollapsibleTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <PlusCircle className="mr-2 h-4 w-4" /> Add Range
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent className="px-6 pb-6 border-b">
                        <div className="p-4 border rounded-lg bg-muted/50">
                             <div className="flex items-end gap-2">
                                <div className="w-32 flex-shrink-0">
                                    {addRangeImagePreview ? (
                                        <div className="relative aspect-square w-full overflow-hidden rounded-md group">
                                            <Image src={addRangeImagePreview} alt="New Range Preview" fill className="object-cover" sizes="128px" />
                                            <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={() => { setAddRangeImage(null); setAddRangeImagePreview(null); }}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Label htmlFor="add-range-image" className="flex flex-col items-center justify-center w-full aspect-square border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary">
                                            <div className="flex flex-col items-center justify-center text-center p-2 text-xs text-muted-foreground">
                                                <Sailboat className="w-6 h-6 mb-1" />
                                                <span>Upload Render</span>
                                            </div>
                                            <Input id="add-range-image" type="file" className="hidden" accept="image/*" onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                setAddRangeImage(file || null);
                                                setAddRangeImagePreview(file ? URL.createObjectURL(file) : null);
                                            }} />
                                        </Label>
                                    )}
                                </div>
                                <Input
                                    placeholder="New range name..."
                                    value={newRangeName}
                                    onChange={(e) => setNewRangeName(e.target.value)}
                                    disabled={isAdding}
                                    className="self-center"
                                />
                                <Button onClick={handleAddRange} disabled={isAdding || !newRangeName.trim()} className="self-center">
                                    {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                                    Add
                                </Button>
                            </div>
                        </div>
                    </CollapsibleContent>
                    <CardContent className="pt-6">
                        {ranges && ranges.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {ranges.map((range, index) => (
                                    <Card key={range.id} className="group relative overflow-hidden flex flex-col h-full transition-all duration-300 ease-in-out hover:border-primary hover:shadow-xl hover:-translate-y-1">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 hover:bg-primary/10 hover:text-primary">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={(e) => { e.preventDefault(); handleMoveRange(index, 'up'); }} disabled={index === 0}>
                                                    <ArrowUp className="mr-2 h-4 w-4" /> Move Up
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={(e) => { e.preventDefault(); handleMoveRange(index, 'down'); }} disabled={index === ranges.length - 1}>
                                                    <ArrowDown className="mr-2 h-4 w-4" /> Move Down
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => { setEditingRange(range); setIsEditDialogOpen(true); }}>
                                                    <Pencil className="mr-2 h-4 w-4" /> Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive" onClick={() => { setRangeToDelete(range); setIsDeleteDialogOpen(true); }}>
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>

                                        <Link href={`/data-warehouse/${vendorSlugOrId}/ranges/${range.slug || range.id}`} className="block h-full">
                                            <div className="h-40 bg-secondary relative">
                                                {range.imageUrl ? (
                                                    <Image src={range.imageUrl} alt={`${range.name} cover`} fill className="object-cover p-4" sizes="(max-width: 768px) 50vw, 25vw" />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center">
                                                        <Sailboat className="h-12 w-12 text-muted-foreground" />
                                                    </div>
                                                )}
                                            </div>
                                            <CardHeader>
                                                <CardTitle className="text-lg">{range.name}</CardTitle>
                                            </CardHeader>
                                        </Link>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                                <p className="text-muted-foreground">No data structure found for Stabicraft.</p>
                                <Button onClick={handleSeedData} disabled={isSeeding} className="mt-4">
                                    {isSeeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                    Build Initial Data Structure
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </Collapsible>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Range: {editingRange?.name}</DialogTitle>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleUpdateRange)} className="space-y-4">
                            <FormField control={editForm.control} name="name" render={({ field }) => (
                                <FormItem><Label>Range Name</Label><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={editForm.control} name="image" render={({ field }) => (
                                <FormItem><Label>Range Image</Label><FormControl><Input type="file" accept="image/*" onChange={(e) => field.onChange(e.target.files?.[0])} /></FormControl><FormDescription>Upload a new image to replace the existing one.</FormDescription><FormMessage /></FormItem>
                            )} />
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                <Button type="submit" disabled={editForm.formState.isSubmitting}>
                                    {editForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Save
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Delete Alert Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the range "{rangeToDelete?.name}" and all models within it. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteRange} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
