'use client';

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { Loader2, PlusCircle, Building2, MoreVertical, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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
import { useFirestore } from "@/firebase/provider";
import { doc, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

interface Organisation {
    id: string;
    name: string;
    slug?: string;
    address?: string;
    primaryLogoUrl?: string;
    primaryColor?: string;
    phoneNumber?: string;
}

export default function OrganisationsPage() {
    const { data: organisations, loading } = useCollection<Organisation>('organisations');
    const [orgToDelete, setOrgToDelete] = useState<Organisation | null>(null);
    const firestore = useFirestore();
    const { toast } = useToast();

    const handleDelete = async () => {
        if (!orgToDelete) return;

        try {
            const orgDocRef = doc(firestore, 'organisations', orgToDelete.id);
            await deleteDoc(orgDocRef).catch((serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: orgDocRef.path,
                    operation: 'delete',
                });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError;
            });
            
            toast({
                title: 'Organisation deleted',
                description: `${orgToDelete.name} has been removed.`,
            });
        } catch (error) {
            console.error("Failed to delete organisation:", error);
            toast({
                variant: 'destructive',
                title: 'Deletion failed',
                description: 'Could not delete the organisation. Please try again.',
            });
        } finally {
            setOrgToDelete(null);
        }
    };

    return (
      <AdminGuard>
        <div className="space-y-4">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Organisations</h1>
                    <BreadcrumbNav />
                </div>
                <Button asChild>
                    <Link href="/organisations/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        New Organisation
                    </Link>
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-24">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {organisations && organisations.length > 0 ? (
                            organisations.map((org) => (
                                <Link href={`/organisations/${org.slug || org.id}`} key={org.id} className="group">
                                    <Card 
                                        className="h-full transition-all duration-300 ease-in-out group-hover:-translate-y-1 group-hover:shadow-xl overflow-hidden flex flex-col"
                                        style={{ borderTop: `4px solid ${org.primaryColor || 'hsl(var(--primary))'}` }}
                                    >
                                        <CardHeader>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-grow overflow-hidden">
                                                    {org.primaryLogoUrl ? (
                                                        <div className="relative h-12">
                                                            <Image
                                                                src={org.primaryLogoUrl}
                                                                alt={`${org.name} logo`}
                                                                fill
                                                                className="object-contain object-left"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <CardTitle className="text-lg truncate">{org.name}</CardTitle>
                                                    )}
                                                </div>
                                                <div className="-mr-3 -mt-2 flex-shrink-0">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.preventDefault()}>
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem 
                                                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                                                onSelect={() => setOrgToDelete(org)}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="flex-grow pt-0">
                                            {org.primaryLogoUrl && (
                                                <h3 className="font-semibold text-lg truncate">{org.name}</h3>
                                            )}
                                            <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{org.address || 'No address provided'}</p>
                                            {org.phoneNumber && <p className="text-sm text-muted-foreground mt-2">{org.phoneNumber}</p>}
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))
                        ) : (
                            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
                                <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed">
                                    <Building2 className="h-16 w-16 text-muted-foreground" />
                                    <h3 className="mt-4 text-lg font-semibold">No Organisations Found</h3>
                                    <p className="mt-2 text-sm text-muted-foreground">You haven't created any organisations yet.</p>
                                    <Button asChild className="mt-6">
                                        <Link href="/organisations/add">
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            Create First Organisation
                                        </Link>
                                    </Button>
                                </Card>
                            </div>
                        )}
                    </div>

                    {orgToDelete && (
                        <AlertDialog open={!!orgToDelete} onOpenChange={(open) => !open && setOrgToDelete(null)}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the <strong>{orgToDelete.name}</strong> organisation.
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
                    )}
                </>
            )}
        </div>
      </AdminGuard>
    );
}
