'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, doc, updateDoc, deleteDoc, addDoc, orderBy, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LayoutGrid, List, Sailboat, MoreHorizontal, Pencil, Trash2, ArrowRight, PlusCircle, X, ArrowUp, ArrowDown } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AdminGuard from '@/components/admin-guard';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';


interface Model {
    id: string;
    name: string;
    slug?: string;
    coverImageUrl?: string;
    packages?: { id: string; name: string }[];
    packageLevels?: { id: string; name: string }[];
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

const packageFormSchema = z.object({
    name: z.string().min(1, { message: "Package name is required." }),
});
type PackageFormData = z.infer<typeof packageFormSchema>;

function PackageDialog({
    isOpen,
    setIsOpen,
    onSave,
    editingPackage
}: {
    isOpen: boolean,
    setIsOpen: (isOpen: boolean) => void,
    onSave: (data: PackageFormData) => void,
    editingPackage: { id: string; name: string } | null
}) {
    const form = useForm<PackageFormData>({
        resolver: zodResolver(packageFormSchema),
        defaultValues: { name: '' },
    });
    
    useEffect(() => {
        if (isOpen) {
            form.reset({ name: editingPackage?.name || '' });
        }
    }, [isOpen, editingPackage, form]);

    const handleSave = (data: PackageFormData) => {
        onSave(data);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingPackage ? 'Edit Package' : 'Add New Package'}</DialogTitle>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSave)}>
                        <div className="grid gap-4 py-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <Label htmlFor="name">Package Name</Label>
                                        <FormControl>
                                            <Input id="name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function ModelCard({ vendor, range, model, index, totalModels, onMove }: { vendor: Vendor; range: Range; model: Model; index: number; totalModels: number; onMove: (index: number, direction: 'up' | 'down') => void; }) {
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [newModelName, setNewModelName] = useState(model.name);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);

    const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
    const [editingPackage, setEditingPackage] = useState<{ id: string; name: string } | null>(null);

    const modelPath = `/data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteDoc(doc(firestore, modelPath));
            toast({ title: 'Model Deleted', description: `"${model.name}" has been deleted.` });
            router.refresh();
        } catch (error) {
            console.error('Failed to delete model:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete model.' });
            setIsDeleting(false);
        }
    };

    const handleRename = async () => {
        if (!newModelName.trim() || newModelName === model.name) {
            setIsRenameDialogOpen(false);
            return;
        }
        setIsRenaming(true);
        try {
            const newSlug = createSlug(newModelName);
            await updateDoc(doc(firestore, modelPath), { name: newModelName, slug: newSlug });
            toast({ title: 'Model Renamed', description: `Renamed to "${newModelName}".` });
            setIsRenameDialogOpen(false);
            router.refresh(); 
        } catch (error) {
            console.error('Failed to rename model:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not rename model.' });
        } finally {
            setIsRenaming(false);
        }
    };

    const handleOpenAddPackageDialog = (e: React.MouseEvent) => {
        e.preventDefault();
        setEditingPackage(null);
        setIsPackageDialogOpen(true);
    };

    const handleOpenEditPackageDialog = (pkg: {id: string, name: string}, e: React.MouseEvent) => {
        e.preventDefault();
        setEditingPackage(pkg);
        setIsPackageDialogOpen(true);
    };

    const handleSavePackage = async (data: PackageFormData) => {
        let updatedPackages;
        const currentPackages = model.packageLevels || [];
        if (editingPackage) {
            updatedPackages = currentPackages.map(p => p.id === editingPackage.id ? { ...p, name: data.name } : p);
        } else {
            const newPackage = { id: `pkg-lvl-${Date.now()}`, name: data.name };
            updatedPackages = [...currentPackages, newPackage];
        }
        try {
            await updateDoc(doc(firestore, modelPath), { packageLevels: updatedPackages });
            toast({ title: editingPackage ? 'Package Updated' : 'Package Added' });
        } catch(error) {
            console.error('Failed to save package:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save package.' });
        }
    };

    const handleDeletePackage = async (packageId: string, e: React.MouseEvent) => {
        e.preventDefault();
        const updatedPackages = model.packageLevels?.filter(p => p.id !== packageId) || [];
        try {
            await updateDoc(doc(firestore, modelPath), { packageLevels: updatedPackages });
            toast({ title: 'Package Deleted' });
        } catch(error) {
            console.error('Failed to delete package:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete package.' });
        }
    };
    
    const vendorSlugOrId = vendor.slug || vendor.id;
    const modelSlugOrId = model.slug || model.id;
    const rangeSlugOrId = range.slug || range.id;

    return (
        <>
            <Card className="relative h-full transition-all duration-300 ease-in-out group hover:border-primary hover:shadow-xl hover:-translate-y-1 overflow-hidden flex flex-col">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                         <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 hover:bg-primary/10 hover:text-primary" onClick={(e) => e.preventDefault()}>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.preventDefault()}>
                        <DropdownMenuItem onClick={() => onMove(index, 'up')} disabled={index === 0}>
                            <ArrowUp className="mr-2 h-4 w-4" /> Move Up
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onMove(index, 'down')} disabled={index === totalModels - 1}>
                            <ArrowDown className="mr-2 h-4 w-4" /> Move Down
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { setNewModelName(model.name); setIsRenameDialogOpen(true); }}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                
                <div className="flex-grow">
                    <Link href={`/data-warehouse/${vendorSlugOrId}/ranges/${rangeSlugOrId}/models/${modelSlugOrId}`} className="block">
                        <div className="h-52 bg-secondary relative">
                             {model.coverImageUrl ? (
                                <>
                                    <Image src={model.coverImageUrl} alt={`${model.name} cover`} fill className="object-cover" />
                                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-card to-transparent" />
                                </>
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Sailboat className="h-12 w-12 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <CardContent className="p-3">
                            <p className="font-semibold truncate text-center">{model.name}</p>
                        </CardContent>
                    </Link>
                </div>


                {vendor.slug === 'stabicraft' && (
                    <div className="p-3 border-t">
                        <div className="space-y-2">
                             <div className="flex justify-between items-center mb-2">
                                <h4 className="text-sm font-medium text-muted-foreground">Packages</h4>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenAddPackageDialog}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="space-y-1 min-h-[60px]">
                                {(model.packageLevels && model.packageLevels.length > 0) ? (
                                    model.packageLevels.map(pkg => (
                                        <div key={pkg.id} className="group/pkg flex items-center justify-between rounded-md bg-secondary text-secondary-foreground px-3 py-1.5 text-sm transition-colors hover:bg-secondary/80 w-full h-full">
                                            <span className="font-medium truncate pr-2">{pkg.name}</span>
                                            <div className="flex items-center opacity-0 group-hover/pkg:opacity-100 transition-opacity -mr-2 shrink-0">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleOpenEditPackageDialog(pkg, e)}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => handleDeletePackage(pkg.id, e)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                                        <p>No packages defined.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {/* Dialogs */}
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

            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Model</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Name</Label>
                            <Input id="name" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} className="col-span-3" />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={handleRename} disabled={isRenaming}>
                            {isRenaming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <PackageDialog
                isOpen={isPackageDialogOpen}
                setIsOpen={setIsPackageDialogOpen}
                onSave={handleSavePackage}
                editingPackage={editingPackage}
            />
        </>
    );
}


export default function RangeDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const vendorSlugOrId = params?.id as string | undefined;
    const rangeSlugOrId = params?.rangeId as string | undefined;
    const firestore = useFirestore();
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [isAddModelDialogOpen, setIsAddModelDialogOpen] = useState(false);
    const [newModelName, setNewModelName] = useState('');
    const [isAddingModel, setIsAddingModel] = useState(false);
    const { toast } = useToast();

    const vendorQuery = useMemo(() => {
        if (!vendorSlugOrId) return null;
        return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
    }, [firestore, vendorSlugOrId]);
    
    const { data: vendorsBySlug, loading: slugLoading } = useCollection<Vendor>(vendorQuery);
    const { data: vendorById, loading: idLoading } = useDoc<Vendor>(vendorSlugOrId ? `/data-warehouse/${vendorSlugOrId}` : null);
    const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
    const vendorLoading = slugLoading || idLoading;

    const rangeQueryBySlug = useMemo(() => {
        if (!vendor || !rangeSlugOrId) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
    }, [firestore, vendor, rangeSlugOrId]);
    
    const { data: rangesBySlug, loading: rangeSlugLoading } = useCollection<Range>(rangeQueryBySlug);
    const { data: rangeById, loading: rangeIdLoading } = useDoc<Range>(vendor && rangeSlugOrId ? `/data-warehouse/${vendor.id}/ranges/${rangeSlugOrId}` : null);
    const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);
    const rangeLoading = rangeSlugLoading || rangeIdLoading;


    const modelsCollectionPath = useMemo(() => {
        if (!vendor || !range) return null;
        return `/data-warehouse/${vendor.id}/ranges/${range.id}/models`;
    }, [vendor, range]);

    const modelsQuery = useMemo(() => {
        if (!modelsCollectionPath) return null;
        return query(collection(firestore, modelsCollectionPath));
    }, [firestore, modelsCollectionPath]);

    const { data: rawModels, loading: modelsLoading } = useCollection<Model>(modelsQuery);

    const sortedModels = useMemo(() => {
        if (!rawModels) return [];
        return [...rawModels].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    }, [rawModels]);

    useEffect(() => {
        if (rawModels && rawModels.length > 0 && rawModels.some(m => m.order === undefined)) {
            const batch = writeBatch(firestore);
            rawModels.forEach((model, index) => {
                if (model.order === undefined) {
                    const modelRef = doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, model.id);
                    batch.update(modelRef, { order: index });
                }
            });
            batch.commit().catch(err => console.error("Failed to update model order", err));
        }
    }, [rawModels, firestore, vendor, range]);

    const handleAddModel = async () => {
        if (!newModelName.trim() || !vendor || !range || !sortedModels) return;
        setIsAddingModel(true);
        try {
            const modelsCollectionRef = collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`);
            await addDoc(modelsCollectionRef, {
                name: newModelName,
                slug: createSlug(newModelName),
                rangeId: range.id,
                vendorId: vendor.id,
                order: sortedModels.length,
            });
            toast({ title: 'Model Added', description: `${newModelName} was added successfully.` });
            setNewModelName('');
            setIsAddModelDialogOpen(false);
        } catch (error) {
            console.error('Error adding model:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not add model.' });
        } finally {
            setIsAddingModel(false);
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
        batch.update(item1Ref, { order: item2.order });

        const item2Ref = doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, item2.id);
        batch.update(item2Ref, { order: item1.order });

        try {
            await batch.commit();
            toast({ title: 'Order updated' });
        } catch(error) {
            console.error("Failed to update order:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update order.' });
        }
    };
    
    const loading = vendorLoading || rangeLoading || modelsLoading;

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!vendor || !range) return [];
        return [
             { label: 'Admin', href: '/admin' },
             { label: 'Data Warehouse', href: '/data-warehouse' },
             { label: vendor.name, href: `/data-warehouse/${vendor.slug || vendor.id}` },
             { label: range.name, href: '#' }
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
        <AdminGuard>
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
                                <Button variant="outline" onClick={() => setIsAddModelDialogOpen(true)}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Add Model
                                </Button>
                                <Button variant={viewMode === 'card' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('card')}>
                                    <LayoutGrid className="h-4 w-4" />
                                    <span className="sr-only">Card View</span>
                                </Button>
                                <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
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
                                            <ModelCard key={model.id} vendor={vendor} range={range} model={model} index={index} totalModels={sortedModels.length} onMove={handleMoveModel}/>
                                        ))}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Model Name</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedModels.map((model, index) => (
                                                <TableRow key={model.id}>
                                                    <TableCell className="font-medium">{model.name}</TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                 <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                <DropdownMenuItem onClick={() => router.push(`/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}/models/${model.slug || model.id}`)}>
                                                                    <Pencil className="mr-2 h-4 w-4" /> View Details
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem onClick={() => handleMoveModel(index, 'up')} disabled={index === 0}>
                                                                    <ArrowUp className="mr-2 h-4 w-4" /> Move Up
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleMoveModel(index, 'down')} disabled={index === sortedModels.length - 1}>
                                                                    <ArrowDown className="mr-2 h-4 w-4" /> Move Down
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
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
            <Dialog open={isAddModelDialogOpen} onOpenChange={setIsAddModelDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Model</DialogTitle>
                        <DialogDescription>
                            Enter the name for the new model in the {range?.name} range.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Name</Label>
                            <Input id="name" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} className="col-span-3" />
                        </div>
                    </div>
                    <DialogFooter>
                         <DialogClose asChild>
                            <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={handleAddModel} disabled={isAddingModel || !newModelName.trim()}>
                            {isAddingModel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add Model
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminGuard>
    );
}
