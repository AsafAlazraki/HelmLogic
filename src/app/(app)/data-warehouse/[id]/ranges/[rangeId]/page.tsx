'use client';

import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Loader2, PlusCircle, Sailboat, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useMemo, useState, useEffect } from 'react';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, setDoc, query, where, updateDoc, deleteDoc } from 'firebase/firestore';
import { createSlug } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";


interface Range {
    id: string;
    name: string;
    slug?: string;
}

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}

interface Model {
    id: string;
    name: string;
    slug?: string;
    coverImageUrl?: string;
}

const editNameSchema = z.object({
  name: z.string().min(1, 'Model name is required.'),
});

export default function RangeDetailsPage() {
  const params = useParams();
  const firestore = useFirestore();
  const { toast } = useToast();

  const vendorSlugOrId = params.id as string;
  const rangeSlugOrId = params.rangeId as string;

  const [newModelName, setNewModelName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [modelToEdit, setModelToEdit] = useState<Model | null>(null);
  const [modelToDelete, setModelToDelete] = useState<Model | null>(null);

  const editNameForm = useForm<{ name: string }>({
    resolver: zodResolver(editNameSchema),
  });

  useEffect(() => {
    if (modelToEdit) {
      editNameForm.reset({ name: modelToEdit.name });
    }
  }, [modelToEdit, editNameForm]);

  // Fetch Vendor
  const vendorQueryBySlug = useMemo(() => {
    if (!vendorSlugOrId) return null;
    return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
  }, [firestore, vendorSlugOrId]);
  
  const { data: vendorsBySlug, loading: vendorSlugLoading } = useCollection<Vendor>(vendorQueryBySlug);
  const { data: vendorById, loading: vendorIdLoading } = useDoc<Vendor>(vendorSlugOrId ? `/data-warehouse/${vendorSlugOrId}`: null);
  const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
  const vendorLoading = vendorSlugLoading || vendorIdLoading;

  // Fetch Range
  const rangeQueryBySlug = useMemo(() => {
    if (!vendor?.id || !rangeSlugOrId) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
  }, [firestore, vendor, rangeSlugOrId]);

  const { data: rangesBySlug, loading: rangeSlugLoading } = useCollection<Range>(rangeQueryBySlug);
  const { data: rangeById, loading: rangeIdLoading } = useDoc<Range>(vendor?.id && rangeSlugOrId ? `/data-warehouse/${vendor.id}/ranges/${rangeSlugOrId}` : null);
  const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);
  const rangeLoading = rangeSlugLoading || rangeIdLoading;


  const { data: models, loading: modelsLoading } = useCollection<Model>(vendor?.id && range?.id ? `/data-warehouse/${vendor.id}/ranges/${range.id}/models` : null);
  
  const loading = vendorLoading || rangeLoading;

  const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
    if (!vendor || !range) return [];
    return [
      { href: "/admin", label: "Admin" },
      { href: "/data-warehouse", label: "Data Warehouse" },
      { href: `/data-warehouse/${vendor.slug || vendor.id}`, label: vendor.name },
      { href: `/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}`, label: range.name },
    ];
  }, [vendor, range]);

  const handleAddModel = async () => {
      if (!newModelName.trim() || !range || !vendor?.id) return;
      setIsAdding(true);
      try {
          const modelsCollection = collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`);
          const newModelRef = doc(modelsCollection);
          await setDoc(newModelRef, {
              name: newModelName,
              slug: createSlug(newModelName),
              rangeId: range.id,
              vendorId: vendor.id,
          });
          setNewModelName('');
          toast({ title: 'Model Added', description: `${newModelName} was added to the ${range.name} range.` });
      } catch (error) {
          console.error('Error adding model:', error);
          toast({ variant: 'destructive', title: 'Error', description: 'Could not add model.' });
      } finally {
          setIsAdding(false);
      }
  };

  const handleEditName = async (data: { name: string }) => {
    if (!modelToEdit || !vendor || !range) return;
    const modelRef = doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, modelToEdit.id);
    try {
      await updateDoc(modelRef, {
        name: data.name,
        slug: createSlug(data.name),
      });
      toast({ title: 'Model Updated', description: `Renamed to ${data.name}.` });
      setModelToEdit(null);
    } catch (error) {
      console.error('Error updating model:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not update model name.' });
    }
  };

  const handleDeleteModel = async () => {
    if (!modelToDelete || !vendor || !range) return;
    const modelRef = doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, modelToDelete.id);
    try {
      await deleteDoc(modelRef);
      toast({ title: 'Model Deleted', description: `${modelToDelete.name} has been deleted.` });
      setModelToDelete(null);
    } catch (error) {
      console.error('Error deleting model:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete model.' });
    }
  };

  if (loading) {
      return (
        <div className="flex h-[400px] w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      );
  }

  if (!vendor || !range) {
      return (
          <Card>
              <CardHeader>
                  <CardTitle>Not Found</CardTitle>
              </CardHeader>
              <CardContent>
                  <p>The requested vendor or range could not be found.</p>
              </CardContent>
          </Card>
      );
  }

  return (
    <>
      <div className="space-y-4">
          <div>
              <h1 className="text-2xl font-semibold">{vendor.name} - {range.name}</h1>
              <BreadcrumbNav parts={breadcrumbParts} />
          </div>
          <Card>
              <CardHeader>
                  <CardTitle>Models in {range.name}</CardTitle>
                  <CardDescription>Manage the models available in this product range.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="flex items-center gap-2 mb-6">
                      <Input 
                          placeholder="New model name (e.g., Sport 300)"
                          value={newModelName}
                          onChange={(e) => setNewModelName(e.target.value)}
                          disabled={isAdding}
                      />
                      <Button onClick={handleAddModel} disabled={isAdding || !newModelName.trim()}>
                          {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                          Add Model
                      </Button>
                  </div>

                  {modelsLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading models...</span>
                      </div>
                  ) : models && models.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {models.map(model => (
                            <Card key={model.id} className="group flex flex-col overflow-hidden transition-all hover:border-primary hover:-translate-y-1 hover:shadow-md">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 hover:bg-background" onClick={(e) => e.stopPropagation()}>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => setModelToEdit(model)}>
                                            <Pencil className="mr-2 h-4 w-4" /> Edit Name
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive" onClick={() => setModelToDelete(model)}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <Link href={`/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}/models/${model.slug || model.id}`} className="flex flex-col flex-grow">
                                    <div className="h-32 bg-secondary flex items-center justify-center p-4 relative">
                                        {model.coverImageUrl ? (
                                            <Image
                                                src={model.coverImageUrl}
                                                alt={`${model.name} cover image`}
                                                fill
                                                className="object-contain"
                                            />
                                        ) : (
                                            <Sailboat className="h-10 w-10 text-muted-foreground" />
                                        )}
                                    </div>
                                    <CardHeader className="p-4 pt-2 flex-grow-0 items-center">
                                        <CardTitle className="text-base text-center">{model.name}</CardTitle>
                                    </CardHeader>
                                </Link>
                            </Card>
                        ))}
                      </div>
                  ) : (
                      <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg">
                          <p className="text-muted-foreground">No models in this range yet.</p>
                          <p className="text-sm text-muted-foreground mt-1">Use the input above to add the first one.</p>
                      </div>
                  )}
              </CardContent>
          </Card>
      </div>

      <Dialog open={!!modelToEdit} onOpenChange={(open) => !open && setModelToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Model Name</DialogTitle>
            <DialogDescription>
              Enter a new name for the model: <strong>{modelToEdit?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <Form {...editNameForm}>
            <form onSubmit={editNameForm.handleSubmit(handleEditName)} className="space-y-4">
              <FormField
                control={editNameForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setModelToEdit(null)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!modelToDelete} onOpenChange={(open) => !open && setModelToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the model <strong>{modelToDelete?.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setModelToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteModel} className="bg-destructive hover:bg-destructive/90">
              Yes, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
