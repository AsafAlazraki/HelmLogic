'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore } from '@/firebase/provider';
import { collection, query, where, doc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2 } from 'lucide-react';
import AdminGuard from '@/components/admin-guard';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface Organisation {
    id: string;
    name: string;
    address?: string;
    phoneNumber?: string;
    abn?: string;
    primaryColor?: string;
}

export default function OrganisationDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const slug = params.id as string;
    const firestore = useFirestore();

    const orgQuery = useMemo(() => {
        if (!slug) return null;
        // Query for the organisation document using the slug
        return query(collection(firestore, 'organisations'), where('slug', '==', slug));
    }, [firestore, slug]);

    // useCollection to get the result of the query
    const { data: organisations, loading } = useCollection<Organisation>(orgQuery);
    
    // The query returns an array, so we take the first element
    const organisation = organisations?.[0];

    const handleDelete = async () => {
        if (!organisation) return;

        try {
            const orgDocRef = doc(firestore, 'organisations', organisation.id);
            await deleteDoc(orgDocRef)
                .catch((serverError) => {
                    const permissionError = new FirestorePermissionError({
                        path: orgDocRef.path,
                        operation: 'delete',
                    });
                    errorEmitter.emit('permission-error', permissionError);
                    throw serverError;
                });
            
            toast({
                title: 'Organisation deleted',
                description: `${organisation.name} has been permanently removed.`,
            });

            router.push('/organisations');

        } catch (error) {
            console.error("Failed to delete organisation:", error);
            toast({
                variant: 'destructive',
                title: 'Deletion failed',
                description: 'Could not delete the organisation. Please try again.',
            });
        } finally {
            setIsDeleteDialogOpen(false);
        }
    };

    return (
        <AdminGuard>
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">{loading ? 'Loading...' : organisation?.name || 'Organisation Details'}</h1>
                    <BreadcrumbNav pageTitle={organisation?.name} />
                </div>
                
                {loading ? (
                    <div className="flex justify-center items-center py-24">
                        <Loader2 className="h-16 w-16 animate-spin text-primary" />
                    </div>
                ) : organisation ? (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>{organisation.name}</CardTitle>
                                <CardDescription>Details for this organisation.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <p><span className="font-semibold">Address:</span> {organisation.address || 'N/A'}</p>
                                <p><span className="font-semibold">Phone:</span> {organisation.phoneNumber || 'N/A'}</p>
                                <p><span className="font-semibold">ABN:</span> {organisation.abn || 'N/A'}</p>
                            </CardContent>
                            <CardFooter className="border-t pt-6 flex justify-end">
                                <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Organisation
                                </Button>
                            </CardFooter>
                        </Card>

                        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the <strong>{organisation.name}</strong> organisation and all of its associated data.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                                    Yes, delete it
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Organisation not found</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>The requested organisation could not be found.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AdminGuard>
    );
}
