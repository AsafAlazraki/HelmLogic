'use client';

import { useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, Trash2, Wrench, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminGuard from '@/components/admin-guard';

interface DealerFitCategory {
  id: string;
  name: string;
}

export default function DealerFitOptionsPage() {
  const firestore = useFirestore();
  const categoriesQuery = useMemoFirebase(() => collection(firestore, 'dealerFitCategories'), [firestore]);
  const { data: categories, loading } = useCollection<DealerFitCategory>(categoriesQuery);
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const [categoryToDelete, setCategoryToDelete] = useState<DealerFitCategory | null>(null);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setIsAdding(true);
    try {
      await addDoc(collection(firestore, 'dealerFitCategories'), {
        name: newCategoryName,
      });
      toast({ title: 'Category added', description: `"${newCategoryName}" has been created.` });
      setNewCategoryName('');
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error('Error adding category:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not add category.' });
    } finally {
      setIsAdding(false);
    }
  };
  
  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
        await deleteDoc(doc(firestore, 'dealerFitCategories', categoryToDelete.id));
        toast({ title: 'Category deleted' });
    } catch (error) {
        console.error('Error deleting category:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not delete category.' });
    } finally {
        setCategoryToDelete(null);
    }
  };

  const breadcrumbParts = [
    { href: '/admin', label: 'Admin' },
    { href: '/modules', label: 'Modules' },
    { href: '/modules/dealer-fit-options', label: 'Dealer Fit Options' }
  ];

  return (
    <AdminGuard>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dealer Fit Options</h1>
            <BreadcrumbNav parts={breadcrumbParts} />
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Dealer Fit Category</DialogTitle>
                <DialogDescription>
                  This category will be available for organisations to add their own fitted options to.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="category-name">Category Name</Label>
                <Input
                  id="category-name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g., Electronics Pack"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleAddCategory} disabled={isAdding || !newCategoryName.trim()}>
                  {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Category
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Master Categories</CardTitle>
            <CardDescription>
              This is the master list of categories that can be assigned to organisations for their dealer-fitted options.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : categories && categories.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Category Name</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {categories.map(category => (
                            <TableRow key={category.id}>
                                <TableCell className="font-medium">{category.name}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => setCategoryToDelete(category)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : (
                <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Wrench className="mx-auto h-12 w-12" />
                    <h3 className="mt-4 text-lg font-semibold">No Categories Found</h3>
                    <p className="mt-1 text-sm">Get started by creating your first dealer fit category.</p>
                </div>
            )}
          </CardContent>
        </Card>
      </div>

       <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertTriangle className="h-6 w-6" />
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-3">
              <p>Deleting <strong className="text-foreground">"{categoryToDelete?.name}"</strong> is permanent and has significant risks:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-foreground">Loss of Access:</strong> Every organisation currently using this card will lose it immediately.</li>
                <li><strong className="text-foreground">Data Deletion:</strong> Any items or packages configured by organisations within this card will be permanently removed.</li>
                <li><strong className="text-foreground">Quoting Impact:</strong> Existing quotes using selections from this card may lose their specific configuration data.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategory}
              className="bg-destructive hover:bg-destructive/90"
            >
              I understand, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminGuard>
  );
}