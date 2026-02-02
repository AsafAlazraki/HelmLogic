'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';

import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore } from '@/firebase/provider';
import { collection, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2, Save, X, Mail } from 'lucide-react';
import AdminGuard from '@/components/admin-guard';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { fileToDataUri } from '@/firebase/storage-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sendInviteEmail } from '@/ai/flows/send-invite-email-flow';

const hexColorValidation = z.string().nullable().optional();

const roleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: "Role name is required." }),
  parent: z.string(),
});

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: 'Organisation name is required.' }),
  slug: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  abn: z.string().nullable().optional(),
  primaryColor: hexColorValidation,
  accentColor: hexColorValidation,
  secondaryColor: hexColorValidation,
  roles: z.array(roleSchema).optional(),
  primaryLogo: z.any().optional(),
  secondaryLogo: z.any().optional(),
  primaryLogoUrl: z.string().nullable().optional(),
  secondaryLogoUrl: z.string().nullable().optional(),
});

type OrganisationFormData = z.infer<typeof formSchema>;

const inviteFormSchema = z.object({
    email: z.string().email({ message: 'Please enter a valid email address.' }),
    roleId: z.string().min(1, { message: 'Please select a role for the user.' }),
});

type InviteFormData = z.infer<typeof inviteFormSchema>;

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
    const [isInviting, setIsInviting] = useState(false);
    const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
    const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
    const slugOrId = params.id as string;
    const firestore = useFirestore();

    const orgQueryBySlug = useMemo(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'organisations'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);

    const { data: organisationsBySlug, loading: slugLoading } = useCollection<OrganisationFormData>(orgQueryBySlug);
    const { data: organisationById, loading: idLoading } = useDoc<OrganisationFormData>(slugOrId ? `/organisations/${slugOrId}` : null);

    const organisation = useMemo(() => organisationsBySlug?.[0] || organisationById, [organisationsBySlug, organisationById]);
    const orgLoading = slugLoading || idLoading;

    const form = useForm<OrganisationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {},
    });

    const inviteForm = useForm<InviteFormData>({
        resolver: zodResolver(inviteFormSchema),
        defaultValues: { email: '', roleId: '' },
    });

    useEffect(() => {
        if (organisation) {
            form.reset(organisation);
            if (organisation.primaryLogoUrl) setPrimaryLogoPreview(organisation.primaryLogoUrl);
            if (organisation.secondaryLogoUrl) setSecondaryLogoPreview(organisation.secondaryLogoUrl);
        }
    }, [organisation, form]);

    async function onInviteSubmit(values: InviteFormData) {
        if (!organisation) return;
        setIsInviting(true);
        
        const roleName = organisation.roles?.find(r => r.id === values.roleId)?.name;
        if (!roleName) {
            toast({
                variant: "destructive",
                title: "Invalid Role",
                description: "The selected role could not be found."
            });
            setIsInviting(false);
            return;
        }
    
        try {
            const result = await sendInviteEmail({
                email: values.email,
                organisationName: organisation.name,
                roleName: roleName,
            });
    
            if (result.success) {
                toast({
                    title: "Invite Sent",
                    description: result.message
                });
                inviteForm.reset();
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Failed to Send Invite",
                description: error.message || "An unexpected error occurred."
            });
        } finally {
            setIsInviting(false);
        }
    }

    async function onSubmit(values: OrganisationFormData) {
        if (!organisation) return;
        setIsSubmitting(true);
        
        try {
            const orgDocRef = doc(firestore, 'organisations', organisation.id);

            const dataToUpdate: { [key: string]: any } = {
                name: values.name,
                slug: createSlug(values.name),
                address: values.address || '',
                phoneNumber: values.phoneNumber || '',
                abn: values.abn || '',
                primaryColor: values.primaryColor || '',
                accentColor: values.accentColor || '',
                secondaryColor: values.secondaryColor || '',
                roles: values.roles || [],
            };
            
            if (values.primaryLogo instanceof File) {
                dataToUpdate.primaryLogoUrl = await fileToDataUri(values.primaryLogo);
            } else if (values.primaryLogoUrl === '') {
                dataToUpdate.primaryLogoUrl = null;
            } else {
                dataToUpdate.primaryLogoUrl = organisation.primaryLogoUrl || null;
            }
            
            if (values.secondaryLogo instanceof File) {
                dataToUpdate.secondaryLogoUrl = await fileToDataUri(values.secondaryLogo);
            } else if (values.secondaryLogoUrl === '') {
                dataToUpdate.secondaryLogoUrl = null;
            } else {
                dataToUpdate.secondaryLogoUrl = organisation.secondaryLogoUrl || null;
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
            if (dataToUpdate.slug !== slugOrId) {
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
            window.location.href = '/organisations';
        } catch (error) {
            console.error("Failed to delete organisation:", error);
            toast({ variant: 'destructive', title: 'Deletion failed', description: 'Could not delete the organisation.' });
            setIsDeleteDialogOpen(false);
        }
    };

    const ColorFormField = ({ name, label, description }: { name: "primaryColor" | "accentColor" | "secondaryColor", label: string, description: string }) => (
        <FormField control={form.control} name={name} render={({ field }) => (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <div className="flex items-center gap-2">
                <Input type="color" className="h-10 w-14 p-1" {...field} value={field.value ?? ''} />
                <FormControl>
                    <Input placeholder="#RRGGBB" {...field} value={field.value ?? ''} />
                </FormControl>
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
                <Tabs defaultValue="details" className="space-y-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">Edit {organisation.name}</h1>
                            <BreadcrumbNav pageTitle={organisation?.name} />
                        </div>
                    </div>
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="details">Company Details</TabsTrigger>
                        <TabsTrigger value="users">Users</TabsTrigger>
                        <TabsTrigger value="sub-dealers">Sub Dealers</TabsTrigger>
                        <TabsTrigger value="access">Access</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="details">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                <div className="flex items-center justify-end gap-2">
                                    <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <Save className="mr-2 h-4 w-4" /> Save Changes
                                    </Button>
                                </div>
                                
                                <div className="grid gap-8 lg:grid-cols-3">
                                    <div className="lg:col-span-2 space-y-8">
                                        <Card>
                                            <CardHeader><CardTitle>Organisation Details</CardTitle><CardDescription>Primary details for the organisation.</CardDescription></CardHeader>
                                            <CardContent className="space-y-6">
                                                <FormField control={form.control} name="name" render={({ field }) => (
                                                    <FormItem><FormLabel>Organisation Name</FormLabel><FormControl><Input placeholder="e.g., Global Shipping Inc." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                )} />
                                                <FormField control={form.control} name="address" render={({ field }) => (
                                                    <FormItem><FormLabel>Address</FormLabel><FormControl><Input placeholder="123 Ocean Ave, Metropolis, NY 10001" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                )} />
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                                                        <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="(+1) 555-123-4567" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                    )} />
                                                    <FormField control={form.control} name="abn" render={({ field }) => (
                                                        <FormItem><FormLabel>ABN</FormLabel><FormControl><Input placeholder="e.g., 53 004 085 616" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
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
                                                        {primaryLogoPreview && (
                                                            <div className="mt-2 w-32 h-32 relative group">
                                                                <Image src={primaryLogoPreview} alt="Primary Logo Preview" fill className="rounded-md object-contain border p-1" />
                                                                <Button
                                                                    type="button"
                                                                    variant="destructive"
                                                                    size="icon"
                                                                    className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                                    onClick={() => {
                                                                        setPrimaryLogoPreview(null);
                                                                        form.setValue('primaryLogoUrl', '');
                                                                        field.onChange(null);
                                                                    }}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                        <FormControl><Input type="file" accept="image/*" onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            field.onChange(file);
                                                            setPrimaryLogoPreview(file ? URL.createObjectURL(file) : null);
                                                        }} /></FormControl>
                                                        <FormDescription>Upload a new logo to replace the existing one.</FormDescription><FormMessage />
                                                    </FormItem>
                                                )} />
                                                <FormField control={form.control} name="secondaryLogo" render={({ field }) => (
                                                    <FormItem><FormLabel>Secondary Logo</FormLabel>
                                                        {secondaryLogoPreview && (
                                                            <div className="mt-2 w-32 h-32 relative group">
                                                                <Image src={secondaryLogoPreview} alt="Secondary Logo Preview" fill className="rounded-md object-contain border p-1" />
                                                                <Button
                                                                    type="button"
                                                                    variant="destructive"
                                                                    size="icon"
                                                                    className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                                    onClick={() => {
                                                                        setSecondaryLogoPreview(null);
                                                                        form.setValue('secondaryLogoUrl', '');
                                                                        field.onChange(null);
                                                                    }}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                        <FormControl><Input type="file" accept="image/*" onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            field.onChange(file);
                                                            setSecondaryLogoPreview(file ? URL.createObjectURL(file) : null);
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
                    </TabsContent>
                    
                    <TabsContent value="users">
                        <Card>
                            <CardHeader>
                                <CardTitle>Manage Users</CardTitle>
                                <CardDescription>Invite new users and manage existing members of the organisation.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground mb-6">A list of existing users will be displayed here once the feature is implemented.</p>
                                <Separator />
                                <div className="mt-6">
                                    <h3 className="text-lg font-medium">Invite New User</h3>
                                    <Form {...inviteForm}>
                                        <form onSubmit={inviteForm.handleSubmit(onInviteSubmit)} className="mt-4 space-y-4 max-w-lg">
                                            <FormField control={inviteForm.control} name="email" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Email Address</FormLabel>
                                                    <FormControl><Input placeholder="name@example.com" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                            <FormField control={inviteForm.control} name="roleId" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Role</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select a role to assign" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {organisation.roles && organisation.roles.length > 0 ? (
                                                                organisation.roles.map(role => (
                                                                    <SelectItem key={role.id} value={role.id}>
                                                                        {role.name}
                                                                    </SelectItem>
                                                                ))
                                                            ) : (
                                                                <SelectItem value="no-roles" disabled>No roles defined for this organisation</SelectItem>
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                            <Button type="submit" disabled={isInviting}>
                                                {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                <Mail className="mr-2 h-4 w-4" /> Send Invite
                                            </Button>
                                        </form>
                                    </Form>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="sub-dealers">
                        <Card>
                            <CardHeader>
                                <CardTitle>Sub Dealers</CardTitle>
                                <CardDescription>Manage sub dealers associated with this organisation.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p>This feature is not yet available.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="access">
                        <Card>
                            <CardHeader>
                                <CardTitle>Access Control</CardTitle>
                                <CardDescription>Manage access permissions and integrations for this organisation.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p>This feature is not yet available.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
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
