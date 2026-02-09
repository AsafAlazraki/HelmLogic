'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LayoutGrid, List, Sailboat, MoreHorizontal, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
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
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSlug } from '@/lib/utils';
import Link from 'next/link';

interface Model {
    id: string;
    name: string;
    slug?: string;
    coverImageUrl?: string;
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

function ModelCard({ vendor, range, model, onModelDeleted }: { vendor: Vendor; range: Range; model: Model; onModelDeleted: (id: string) => void }) {
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [newModelName, setNewModelName] = useState(model.name);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);

    const modelPath = `/data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteDoc(doc(firestore, modelPath));
            toast({ title: 'Model Deleted', description: `"${model.name}" has been deleted.` });
            onModelDeleted(model.id);
            setIsDeleteDialogOpen(false);
        } catch (error) {
            console.error('Failed to delete model:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete model.' });
        } finally {
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
    
    const vendorSlugOrId = vendor.slug || vendor.id;
    const modelSlugOrId = model.slug || model.id;
    const rangeSlugOrId = range.slug || range.id;

    return (
        <>
            <Card className="h-full transition-all duration-300 ease-in-out group hover:border-primary hover:-translate-y-1 hover:shadow-xl overflow-hidden flex flex-col">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                         <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 hover:bg-primary/10 hover:text-primary" onClick={(e) => e.preventDefault()}>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.preventDefault()}>
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

                <Link href={`/data-warehouse/${vendorSlugOrId}/ranges/${rangeSlugOrId}/models/${modelSlugOrId}`} className="flex flex-col h-full">
                    <div className="h-40 bg-secondary flex items-center justify-center p-4 relative">
                         {model.coverImageUrl ? (
                            <Image src={model.coverImageUrl} alt={`${model.name} cover`} fill className="object-cover" />
                        ) : (
                            <Sailboat className="h-12 w-12 text-muted-foreground" />
                        )}
                    </div>
                    <CardContent className="p-3 mt-auto">
                        <p className="font-semibold truncate text-center">{model.name}</p>
                    </CardContent>
                </Link>
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
        </>
    );
}


export default function RangeDetailsPage() {
    const params = useParams();
    const vendorSlugOrId = params?.id as string | undefined;
    const rangeSlugOrId = params?.rangeId as string | undefined;
    const firestore = useFirestore();
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [models, setModels] = useState<Model[]>([]);

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

    const { data: fetchedModels, loading: modelsLoading } = useCollection<Model>(modelsCollectionPath);

    useEffect(() => {
        if (fetchedModels) {
            setModels(fetchedModels);
        }
    }, [fetchedModels]);

    const handleModelDeleted = (deletedId: string) => {
        setModels(currentModels => currentModels.filter(m => m.id !== deletedId));
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
                         {models.length > 0 ? (
                            <>
                                {viewMode === 'card' ? (
                                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {models.map((model) => (
                                            <ModelCard key={model.id} vendor={vendor} range={range} model={model} onModelDeleted={handleModelDeleted} />
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
                                            {models.map((model) => (
                                                <TableRow key={model.id}>
                                                    <TableCell className="font-medium">{model.name}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button asChild variant="ghost" size="sm">
                                                            <Link href={`/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}/models/${model.slug || model.id}`}>
                                                                View Details
                                                                <ArrowRight className="ml-2 h-4 w-4" />
                                                            </Link>
                                                        </Button>
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
        </AdminGuard>
    );
}
