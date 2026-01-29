'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';

import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useStorage } from '@/firebase/provider';
import { collection, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2, Save } from 'lucide-react';
import AdminGuard from '@/components/admin-guard';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { RoleHierarchyChart } from '@/components/role-hierarchy-chart';
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
import { uploadFile } from '@/firebase/storage-utils';

const hexColorValidation = z.string().refine(val => !val || /^#[0-9A-F]{6}$/i.test(val), {
    message: "Must be a valid hex color code (e.g., #RRGGBB)",
}).optional().or(z.literal(''));

const roleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: "Role name is required." }),
  parent: z.string(),
});

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: 'Organisation name is required.' }),
  slug: z.string(),
  address: z.string().optional(),
  phoneNumber: z.string().optional(),
  abn: z.string().optional(),
  primaryColor: hexColorValidation,
  accentColor: hexColorValidation,
  secondaryColor: hexColorValidation,
  roles: z.array(roleSchema).optional(),
  primaryLogo: z.any().optional(),
  secondaryLogo: z.any().optional(),
  primaryLogoUrl: z.string().optional(),
  secondaryLogoUrl: z.string().optional(),
});

type OrganisationFormData = z.infer<typeof formSchema>;

const createSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');

export default function OrganisationDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
    const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
    const slug = params.id as string;
    const firestore = useFirestore();
    const storage = useStorage();

    const orgQuery = useMemo(() => {
        if (!slug) return null;
        return query(collection(firestore, 'organisations'), where('slug', '==', slug));
    }, [firestore, slug]);

    const { data: organisations, loading: orgLoading } = useCollection<OrganisationFormData>(orgQuery);
    const organisation = organisations?.[0];

    const form = useForm<OrganisationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            slug: '',
            address: '',
            phoneNumber: '',
            abn: '',
            primaryColor: '',
            accentColor: '',
            secondaryColor: '',
            roles: [],
        },
    });

    useEffect(() => {
        if (organisation) {
            form.reset(organisation);
            if (organisation.primaryLogoUrl) setPrimaryLogoPreview(organisation.primaryLogoUrl);
            if (organisation.secondaryLogoUrl) setSecondaryLogoPreview(organisation.secondaryLogoUrl);
        }
    }, [organisation, form]);

    async function onSubmit(values: OrganisationFormData) {
        if (!organisation) return;
        setIsSubmitting(true);
        
        try {
            const orgDocRef = doc(firestore, 'organisations', organisation.id);

            // Create a clean data object for Firestore
            const dataToUpdate: { [key: string]: any } = {
                name: values.name,
                slug: createSlug(values.name),
                address: values.address,
                phoneNumber: values.phoneNumber,
                abn: values.abn,
                primaryColor: values.primaryColor,
                accentColor: values.accentColor,
                secondaryColor: values.secondaryColor,
                roles: values.roles,
                // Keep existing URLs by default
                primaryLogoUrl: values.primaryLogoUrl,
                secondaryLogoUrl: values.secondaryLogoUrl,
            };

            // If a new primary logo file is present, upload it and set the URL
            if (values.primaryLogo instanceof File) {
                const path = `organisations/${organisation.id}/logos/primary_${values.primaryLogo.name}`;
                dataToUpdate.primaryLogoUrl = await uploadFile(storage, values.primaryLogo, path);
            }
            
            // If a new secondary logo file is present, upload it and set the URL
            if (values.secondaryLogo instanceof File) {
                const path = `organisations/${organisation.id}/logos/secondary_${values.secondaryLogo.name}`;
                dataToUpdate.secondaryLogoUrl = await uploadFile(storage, values.secondaryLogo, path);
            }

            await updateDoc(orgDocRef, dataToUpdate)
                .catch((serverError) => {
                    const permissionError = new FirestorePermissionError({
                        path: orgDocRef.path, operation: 'update', requestResourceData: dataToUpdate,
                    });
                    errorEmitter.emit('permission-error', permissionError);
                    throw serverError; // Re-throw
                });

            toast({ title: 'Organisation updated', description: `${values.name} has been updated successfully.` });
            if (dataToUpdate.slug !== slug) {
                router.replace(`/organisations/${dataToUpdate.slug}`);
            }

        } catch (error: any) {
            console.error("Failed to update organisation:", error);
            toast({ variant: 'destructive', title: 'Failed to update organisation', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleDelete = async () => {
        if (!organisation) return;
        try {
            const orgDocRef = doc(firestore, 'organisations', organisation.id);
            await deleteDoc(orgDocRef).catch((serverError) => {
                const permissionError = new FirestorePermissionError({ path: orgDocRef.path, operation: 'delete' });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError;
            });
            toast({ title: 'Organisation deleted', description: `${organisation.name} has been permanently removed.` });
            router.push('/organisations');
        } catch (error) {
            console.error("Failed to delete organisation:", error);
            toast({ variant: 'destructive', title: 'Deletion failed', description: 'Could not delete the organisation.' });
        } finally {
            setIsDeleteDialogOpen(false);
        }
    };

    const ColorFormField = ({ name, label, description }: { name: "primaryColor" | "accentColor" | "secondaryColor", label: string, description: string }) => (
        <FormField control={form.control} name={name} render={({ field }) => (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl><Input type="color" className="h-10 w-14 p-1" {...field} /></FormControl>
                <FormControl><Input placeholder="#RRGGBB" {...field} /></FormControl>
              </div>
              <FormDescription>{description}</FormDescription>
              <FormMessage />
            </FormItem>
        )} />
    );

    return (
        <AdminGuard>
            {orgLoading ? (
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            ) : organisation ? (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-semibold">Edit {organisation.name}</h1>
                                <BreadcrumbNav pageTitle={organisation?.name} />
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" /> Save Changes
                                </Button>
                            </div>
                        </div>
                        
                        <div className="grid gap-8 lg:grid-cols-3">
                            <div className="lg:col-span-2 space-y-8">
                                <Card>
                                    <CardHeader><CardTitle>Organisation Details</CardTitle><CardDescription>Primary details for the organisation.</CardDescription></CardHeader>
                                    <CardContent className="space-y-6">
                                        <FormField control={form.control} name="name" render={({ field }) => (
                                            <FormItem><FormLabel>Organisation Name</FormLabel><FormControl><Input placeholder="e.g., Global Shipping Inc." {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="address" render={({ field }) => (
                                            <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea placeholder="123 Ocean Ave..." {...field} rows={4}/></FormControl><FormDescription>An address search feature will be added later.</FormDescription><FormMessage /></FormItem>
                                        )} />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                                                <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="(+1) 555-123-4567" {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={form.control} name="abn" render={({ field }) => (
                                                <FormItem><FormLabel>ABN</FormLabel><FormControl><Input placeholder="e.g., 53 004 085 616" {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader><CardTitle>Role Hierarchy</CardTitle><CardDescription>Build the organisation's role structure.</CardDescription></CardHeader>
                                    <CardContent>
                                        <FormField control={form.control} name="roles" render={({ field }) => (<RoleHierarchyChart value={field.value || []} onChange={field.onChange} />)} />
                                    </CardContent>
                                </Card>
                            </div>
                            <div className="lg:col-span-1 space-y-8">
                                <Card>
                                    <CardHeader><CardTitle>Organisation Branding</CardTitle><CardDescription>Customize the look and feel.</CardDescription></CardHeader>
                                    <CardContent className="space-y-6">
                                        <ColorFormField name="primaryColor" label="Primary Color" description="The main brand color."/>
                                        <ColorFormField name="accentColor" label="Accent Color" description="Color for highlights and links."/>
                                        <ColorFormField name="secondaryColor" label="Secondary Color" description="Used for backgrounds and panels."/>
                                        <Separator />
                                        <FormField control={form.control} name="primaryLogo" render={({ field }) => (
                                            <FormItem><FormLabel>Primary Logo</FormLabel>
                                                {primaryLogoPreview && <div className="mt-2 w-32 h-32 relative"><Image src={primaryLogoPreview} alt="Primary Logo Preview" fill className="rounded-md object-contain border p-1" /></div>}
                                                <FormControl><Input type="file" accept="image/*" onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    field.onChange(file);
                                                    setPrimaryLogoPreview(file ? URL.createObjectURL(file) : organisation.primaryLogoUrl || null);
                                                }} /></FormControl>
                                                <FormDescription>Upload a new logo to replace the existing one.</FormDescription><FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="secondaryLogo" render={({ field }) => (
                                            <FormItem><FormLabel>Secondary Logo</FormLabel>
                                                {secondaryLogoPreview && <div className="mt-2 w-32 h-32 relative"><Image src={secondaryLogoPreview} alt="Secondary Logo Preview" fill className="rounded-md object-contain border p-1" /></div>}
                                                <FormControl><Input type="file" accept="image/*" onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    field.onChange(file);
                                                    setSecondaryLogoPreview(file ? URL.createObjectURL(file) : organisation.secondaryLogoUrl || null);
                                                }} /></FormControl>
                                                <FormDescription>An icon or alternative brand mark.</FormDescription><FormMessage />
                                            </FormItem>
                                        )} />
                                    </CardContent>
                                </Card>
                            </div>
                        </div>

                        <Card className="border-destructive">
                          <CardHeader>
                              <CardTitle className="text-destructive">Danger Zone</CardTitle>
                          </CardHeader>
                          <CardContent>
                              <p className="text-sm text-muted-foreground">Deleting this organisation is permanent and cannot be undone. All associated data will be lost.</p>
                          </CardContent>
                          <CardFooter>
                              <Button variant="destructive" type="button" onClick={() => setIsDeleteDialogOpen(true)}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Organisation
                              </Button>
                          </CardFooter>
                        </Card>
                    </form>
                </Form>
            ) : (
                <Card><CardHeader><CardTitle>Organisation not found</CardTitle></CardHeader><CardContent><p>The requested organisation could not be found.</p></CardContent></Card>
            )}

            {organisation && (
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete <strong>{organisation.name}</strong> and all its data. This action cannot be undone.
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
        </AdminGuard>
    );
}
