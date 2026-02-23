'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, doc, deleteDoc, addDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LayoutGrid, List, Sailboat, Trash2, PlusCircle, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSlug } from '@/lib/utils';
import Link from 'next/link';
import { useUser } from '@/firebase/auth/use-user';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


interface Model {
    id: string;
    name: string;
    modelCode?: string;
    slug?: string;
    coverImageUrl?: string;
    order?: number;
}

interface Range {
    id: string;
    name: string;
    slug?: string;
    vendorId: string;
}

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}

function ModelCard({ 
    vendor, 
    range, 
    model, 
    index, 
    totalModels, 
    onMove,
    onEdit 
}: { 
    vendor: Vendor; 
    range: Range; 
    model: Model; 
    index: number; 
    totalModels: number; 
    onMove: (index: number, direction: 'up' | 'down') => void;
    onEdit: (model: Model) => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const modelPath = `data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteDoc(doc(firestore, modelPath));
            toast({ title: 'Model Deleted', description: `"${model.name}" has been deleted.` });
        } catch (error) {
            console.error('Failed to delete model:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete model.' });
            setIsDeleting(false);
        }
    };
    
    const vendorSlugOrId = vendor.slug || vendor.id;
    const modelSlugOrId = model.slug || model.id;
    const rangeSlugOrId = range.slug || range.id;

    return (
        <>
            <Card className="relative group overflow-hidden flex flex-col h-full transition-all duration-300 hover:border-primary">
                <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/50 hover:bg-primary/10 hover:text-primary" onClick={(e) => { e.preventDefault(); onEdit(model); }}>
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/50 hover:bg-destructive/10 hover:text-destructive" onClick={(e) => { e.preventDefault(); setIsDeleteDialogOpen(true); }}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                <Link href={`/data-warehouse/${vendorSlugOrId}/ranges/${rangeSlugOrId}/models/${modelSlugOrId}`} className="block flex-grow">
                    <div className="h-52 bg-secondary relative">
                            {model.coverImageUrl ? (
                            <Image src={model.coverImageUrl} alt={`${model.name} cover`} fill className="object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <Sailboat className="h-12 w-12 text-muted-foreground" />
                            </div>
                        )}
                    </div>
                    <CardContent className="p-3 h-24 flex flex-col items-center justify-center gap-1">
                        <p className="font-semibold text-center line-clamp-2">{model.name}</p>
                        {model.modelCode ? (
                            <p className="text-[10px] font-mono text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">{model.modelCode}</p>
                        ) : (
                            <p className="text-[10px] text-destructive uppercase font-bold">No Code Set</p>
                        )}
                    </CardContent>
                </Link>
                <CardFooter className="p-2 pt-0 border-t bg-muted/5 flex justify-center gap-1">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent hover:text-accent-foreground" onClick={() => onMove(index, 'up')} disabled={index === 0}>
                                    <ArrowUp className="h-3 w-3" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move Up</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent hover:text-accent-foreground" onClick={() => onMove(index, 'down')} disabled={index === totalModels - 1}>
                                    <ArrowDown className="h-3 w-3" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move Down</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </CardFooter>
            </Card>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the model "{model.name}". This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}


export default function RangeDetailsPage() {
    const params = useParams();
    const vendorSlugOrId = params?.id as string | undefined;
    const rangeSlugOrId = params?.rangeId as string | undefined;
    const firestore = useFirestore();
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    
    // Add State
    const [isAddModelDialogOpen, setIsAddModelDialogOpen] = useState(false);
    const [newModelName, setNewModelName] = useState('');
    const [newModelCode, setNewModelCode] = useState('');
    const [isAddingModel, setIsAddingModel] = useState(false);

    // Edit State
    const [isEditModelDialogOpen, setIsEditModelDialogOpen] = useState(false);
    const [editingModel, setEditingModel] = useState<Model | null>(null);
    const [editName, setEditName] = useState('');
    const [editCode, setEditCode] = useState('');
    const [isUpdatingModel, setIsUpdatingModel] = useState(false);

    const { toast } = useToast();

    const { user, loading: userLoading } = useUser();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole?: string }>(userProfileRef);
    const isAdmin = !!userProfile && userProfile.appRole === 'HelmLogic Admin';

    const vendorQuery = useMemoFirebase(() => {
        if (!vendorSlugOrId) return null;
        return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
    }, [firestore, vendorSlugOrId]);
    
    const { data: vendorsBySlug, loading: slugLoading } = useCollection<Vendor>(vendorQuery);
    
    const vendorByIdRef = useMemoFirebase(() => 
        vendorSlugOrId ? doc(firestore, 'data-warehouse', vendorSlugOrId) : null,
    [firestore, vendorSlugOrId]);
    
    const { data: vendorById, loading: idLoading } = useDoc<Vendor>(vendorByIdRef);
    const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
    const vendorLoading = slugLoading || idLoading;

    const rangeQueryBySlug = useMemoFirebase(() => {
        if (!vendor || !rangeSlugOrId) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
    }, [firestore, vendor, rangeSlugOrId]);
    
    const { data: rangesBySlug, loading: rangeSlugLoading } = useCollection<Range>(rangeQueryBySlug);
    
    const rangeByIdRef = useMemoFirebase(() => 
        vendor && rangeSlugOrId ? doc(firestore, `data-warehouse/${vendor.id}/ranges`, rangeSlugOrId) : null,
    [firestore, vendor, rangeSlugOrId]);
    
    const { data: rangeById, loading: rangeIdLoading } = useDoc<Range>(rangeByIdRef);
    const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);
    const rangeLoading = rangeSlugLoading || rangeIdLoading;


    const modelsQuery = useMemoFirebase(() => {
        if (!vendor || !range) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`));
    }, [firestore, vendor, range]);

    const { data: rawModels, loading: modelsLoading } = useCollection<Model>(modelsQuery);

    const sortedModels = useMemo(() => {
        if (!rawModels) return [];
        return [...rawModels].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    }, [rawModels]);

    const handleAddModel = async () => {
        if (!newModelName.trim() || !newModelCode.trim() || !vendor || !range || !sortedModels) return;
        setIsAddingModel(true);
        try {
            const modelsCollectionRef = collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`);
            await addDoc(modelsCollectionRef, {
                name: newModelName,
                modelCode: newModelCode.toUpperCase(),
                slug: createSlug(newModelName),
                rangeId: range.id,
                vendorId: vendor.id,
                order: sortedModels.length,
            });
            toast({ title: 'Model Added', description: `${newModelName} was added successfully.` });
            setNewModelName('');
            setNewModelCode('');
            setIsAddModelDialogOpen(false);
        } catch (error) {
            console.error('Error adding model:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not add model.' });
        } finally {
            setIsAddingModel(false);
        }
    };

    const handleOpenEdit = (model: Model) => {
        setEditingModel(model);
        setEditName(model.name);
        setEditCode(model.modelCode || '');
        setIsEditModelDialogOpen(true);
    };

    const handleUpdateModel = async () => {
        if (!editingModel || !editName.trim() || !editCode.trim() || !vendor || !range) return;
        setIsUpdatingModel(true);
        try {
            const modelRef = doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, editingModel.id);
            await updateDoc(modelRef, {
                name: editName,
                modelCode: editCode.toUpperCase(),
                slug: createSlug(editName),
            });
            toast({ title: 'Model Updated' });
            setIsEditModelDialogOpen(false);
        } catch (error) {
            console.error('Failed to update model:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update model.' });
        } finally {
            setIsUpdatingModel(false);
        }
    };

    const handleMoveModel = async (index: number, direction: 'up' | 'down') => {
        if (!sortedModels || !vendor || !range) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= sortedModels.length) return;

        const item1 = sortedModels[index];
        const item2 = sortedModels[newIndex];

        const batch = writeBatch(firestore);
        
        const item1Ref = doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, item1.id);
        batch.update(item1Ref, { order: item2.order ?? newIndex });

        const item2Ref = doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, item2.id);
        batch.update(item2Ref, { order: item1.order ?? index });

        try {
            await batch.commit();
            toast({ title: 'Order updated' });
        } catch(error) {
            console.error("Failed to update order:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update order.' });
        }
    };
    
    const loading = vendorLoading || rangeLoading || modelsLoading || userLoading || profileLoading;

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!vendor || !range) return [];
        return [
             { label: 'Admin', href: '/admin' },
             { label: 'Data Warehouse', href: '/data-warehouse' },
             { label: vendor.name, href: `/data-warehouse/${vendor.slug || vendor.id}` },
             { label: range.name, href: `/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}` }
        ];
    }, [vendor, range]);

    if (loading) {
        return (
            <div className="flex h-[400px] w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!vendor) {
        return (
            <Card>
                <CardHeader><CardTitle>Vendor Not Found</CardTitle></CardHeader>
                <CardContent><p>The requested vendor could not be found.</p></CardContent>
            </Card>
        );
    }

    if (!range) {
        return (
            <Card>
                <CardHeader><CardTitle>Range Not Found</CardTitle></CardHeader>
                <CardContent><p>The requested range could not be found for this vendor.</p></CardContent>
            </Card>
        );
    }

    return (
        <>
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-semibold">Models in {range.name}</h1>
                                <BreadcrumbNav parts={breadcrumbParts} />
                                <CardDescription>Manage the models available in this product range.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                {isAdmin && (
                                    <Button variant="outline" onClick={() => setIsAddModelDialogOpen(true)}>
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Add Model
                                    </Button>
                                )}
                                <Button variant={viewMode === 'card' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('card')} className="hover:bg-accent hover:text-accent-foreground">
                                    <LayoutGrid className="h-4 w-4" />
                                    <span className="sr-only">Card View</span>
                                </Button>
                                <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')} className="hover:bg-accent hover:text-accent-foreground">
                                    <List className="h-4 w-4" />
                                    <span className="sr-only">List View</span>
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {sortedModels && sortedModels.length > 0 ? (
                            <>
                                {viewMode === 'card' ? (
                                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {sortedModels.map((model, index) => (
                                            <ModelCard 
                                                key={model.id} 
                                                vendor={vendor} 
                                                range={range} 
                                                model={model} 
                                                index={index} 
                                                totalModels={sortedModels.length} 
                                                onMove={handleMoveModel}
                                                onEdit={handleOpenEdit}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Model Name</TableHead>
                                                <TableHead>Code</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedModels.map((model, index) => (
                                                <TableRow key={model.id}>
                                                    <TableCell className="font-medium">
                                                        <Link href={`/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}/models/${model.slug || model.id}`} className="hover:underline">
                                                            {model.name}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        {model.modelCode ? (
                                                            <span className="font-mono text-xs uppercase bg-muted px-1.5 py-0.5 rounded">{model.modelCode}</span>
                                                        ) : (
                                                            <span className="text-[10px] text-destructive uppercase font-bold italic">Missing Code</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end items-center gap-2">
                                                            <Button variant="ghost" size="sm" asChild className="hover:bg-accent hover:text-accent-foreground">
                                                                <Link href={`/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}/models/${model.slug || model.id}`}>
                                                                    View Details
                                                                </Link>
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent" onClick={() => handleOpenEdit(model)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <div className="flex gap-1">
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent hover:text-accent-foreground" onClick={() => handleMoveModel(index, 'up')} disabled={index === 0}>
                                                                                <ArrowUp className="h-4 w-4" />
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>Move Up</TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent hover:text-accent-foreground" onClick={() => handleMoveModel(index, 'down')} disabled={index === sortedModels.length - 1}>
                                                                                <ArrowDown className="h-4 w-4" />
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>Move Down</TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-60 border-2 border-dashed rounded-lg">
                                <Sailboat className="h-16 w-16 text-muted-foreground" />
                                <h3 className="mt-4 text-lg font-semibold">No Models in this Range</h3>
                                <p className="mt-2 text-sm text-muted-foreground">Go back to the vendor page to add models to this range.</p>
                                <Button asChild className="mt-6" variant="outline">
                                    <Link href={`/data-warehouse/${vendor.slug || vendor.id}`}>Back to Vendor</Link>
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Add Dialog */}
            <Dialog open={isAddModelDialogOpen} onOpenChange={setIsAddModelDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Model</DialogTitle>
                        <DialogDescription>
                            Enter the details for the new model in the {range?.name} range.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Name</Label>
                            <Input id="name" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} className="col-span-3" placeholder="e.g. 1850 Supercab" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="code" className="text-right">Model Code</Label>
                            <Input id="code" value={newModelCode} onChange={(e) => setNewModelCode(e.target.value)} className="col-span-3 font-mono uppercase" placeholder="e.g. 1850SC" />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleAddModel} disabled={isAddingModel || !newModelName.trim() || !newModelCode.trim()}>
                            {isAddingModel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add Model
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={isEditModelDialogOpen} onOpenChange={setIsEditModelDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Model: {editingModel?.name}</DialogTitle>
                        <DialogDescription>Update the name and code for this master boat record.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-name" className="text-right">Name</Label>
                            <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-code" className="text-right">Model Code</Label>
                            <Input id="edit-code" value={editCode} onChange={(e) => setEditCode(e.target.value)} className="col-span-3 font-mono uppercase" />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleUpdateModel} disabled={isUpdatingModel || !editName.trim() || !editCode.trim()}>
                            {isUpdatingModel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Update Model
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
