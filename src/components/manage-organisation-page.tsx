'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';

import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore } from '@/firebase/provider';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Save, X, Mail, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { RoleHierarchyChart } from '@/components/role-hierarchy-chart';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { fileToDataUri } from '@/firebase/storage-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sendInviteEmail } from '@/ai/flows/send-invite-email-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';


const hexColorValidation = z.string().refine(val => !val || /^#[0-9A-F]{6}$/i.test(val), {
    message: "Must be a valid hex color code (e.g., #RRGGBB)",
}).optional().or(z.literal(''));


const roleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: "Role name is required." }),
  parent: z.preprocess((val) => val ?? '', z.string()),
});

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: 'Organisation name is required.' }),
  address: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  abn: z.string().nullable().optional(),
  primaryColor: hexColorValidation,
  accentColor: hexColorValidation,
  secondaryColor: hexColorValidation,
  roles: z.array(roleSchema).optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
  primaryLogo: z.any().optional(),
  secondaryLogo: z.any().optional(),
  primaryLogoUrl: z.string().nullable().optional(),
  secondaryLogoUrl: z.string().nullable().optional(),
  subDealersEnabled: z.boolean().optional(),
  parentOrganisationId: z.string().nullable().optional(),
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

const permissionsConfig = [
    { id: 'viewFinancials', label: 'View Financials' },
    { id: 'editInventory', label: 'Edit Inventory' },
    { id: 'manageUsers', label: 'Manage Users' },
    { id: 'manageDataSources', label: 'Manage Data Sources' },
];

export default function ManageOrganisationPage({ orgId }: { orgId: string }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
    const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
    const firestore = useFirestore();

    const { data: organisation, loading: orgLoading } = useDoc<OrganisationFormData>(`/organisations/${orgId}`);
    
    const subDealersQuery = useMemo(() => {
        if (!organisation) return null;
        return query(collection(firestore, 'organisations'), where('parentOrganisationId', '==', organisation.id));
    }, [firestore, organisation]);

    const { data: subDealers, loading: subDealersLoading } = useCollection<OrganisationFormData>(subDealersQuery);

    const form = useForm<OrganisationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {},
    });

    const inviteForm = useForm<InviteFormData>({
        resolver: zodResolver(inviteFormSchema),
        defaultValues: { email: '', roleId: '' },
    });
    
    const watchedRoles = form.watch('roles');

    useEffect(() => {
        if (organisation) {
            const initialPermissions = organisation.permissions || {};
            (organisation.roles || []).forEach(role => {
                if (!initialPermissions[role.id]) {
                    initialPermissions[role.id] = {};
                }
            });

            form.reset({ 
                ...organisation, 
                permissions: initialPermissions,
                subDealersEnabled: organisation.subDealersEnabled || false,
            });
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
                organisationId: organisation.id,
                roleId: values.roleId,
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
                permissions: values.permissions || {},
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

        } catch (error: any) {
            console.error("Failed to update organisation:", error);
            toast({ variant: 'destructive', title: 'Failed to update organisation', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    const ColorFormField = ({ name, label, description }: { name: "primaryColor" | "accentColor" | "secondaryColor", label: string, description: string }) => (
        <FormField control={form.control} name={name} render={({ field }) => (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                    <Input type="color" className="h-10 w-14 p-1" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormControl>
                    <Input placeholder="#RRGGBB" {...field} value={field.value ?? ''} />
                </FormControl>
              </div>
              <FormDescription>{description}</FormDescription>
              <FormMessage />
            </FormItem>
        )} />
    );

    const hasSubDealers = organisation?.subDealersEnabled;

    return (
        <>
            {orgLoading ? (
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            ) : organisation ? (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" /> Save Changes
                            </Button>
                        </div>

                        <Tabs defaultValue="details" className="space-y-4">
                            <TabsList className={`grid w-full ${hasSubDealers ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                <TabsTrigger value="details">Company Details</TabsTrigger>
                                <TabsTrigger value="users">Users &amp; Permissions</TabsTrigger>
                                {hasSubDealers && <TabsTrigger value="sub-dealers">Sub Dealers</TabsTrigger>}
                            </TabsList>
                            
                            <TabsContent value="details" className="space-y-8">
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
                            </TabsContent>
                            
                            <TabsContent value="users">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Users &amp; Permissions</CardTitle>
                                        <CardDescription>Invite new users, manage existing members, and configure role-based permissions.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Tabs defaultValue="manage-users">
                                            <TabsList>
                                                <TabsTrigger value="manage-users">Manage Users</TabsTrigger>
                                                <TabsTrigger value="manage-permissions">Manage Permissions</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="manage-users" className="pt-6">
                                                <h3 className="text-lg font-medium">Invite New User</h3>
                                                <Form {...inviteForm}>
                                                    <div className="mt-4 space-y-4 max-w-lg">
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
                                                                                <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                                                                            ))
                                                                        ) : (
                                                                            <SelectItem value="no-roles" disabled>No roles defined for this organisation</SelectItem>
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )} />
                                                        <Button type="button" disabled={isInviting} onClick={inviteForm.handleSubmit(onInviteSubmit)}>
                                                            {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                            <Mail className="mr-2 h-4 w-4" /> Send Invite
                                                        </Button>
                                                    </div>
                                                </Form>
                                                <Separator className="my-6" />
                                                <h3 className="text-lg font-medium">Existing Users</h3>
                                                <p className="text-sm text-muted-foreground mt-2">A list of existing users will be displayed here once the feature is implemented.</p>
                                            </TabsContent>
                                            <TabsContent value="manage-permissions" className="pt-6">
                                                <h3 className="text-lg font-medium">Role Permissions</h3>
                                                <p className="text-sm text-muted-foreground mt-2">Define what each role can see and do. Changes are saved with the rest of the form.</p>
                                                <div className="mt-4 rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-1/3">Role</TableHead>
                                                                {permissionsConfig.map(p => <TableHead key={p.id} className="text-center">{p.label}</TableHead>)}
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {watchedRoles && watchedRoles.length > 0 ? watchedRoles.map((role) => (
                                                                <TableRow key={role.id}>
                                                                    <TableCell className="font-medium">{role.name}</TableCell>
                                                                    {permissionsConfig.map(permission => (
                                                                        <TableCell key={permission.id} className="text-center">
                                                                            <FormField
                                                                                control={form.control}
                                                                                name={`permissions.${role.id}.${permission.id}`}
                                                                                render={({ field }) => (
                                                                                    <FormItem className="flex justify-center p-0 m-0">
                                                                                        <FormControl>
                                                                                            <Checkbox
                                                                                                checked={field.value || false}
                                                                                                onCheckedChange={field.onChange}
                                                                                            />
                                                                                        </FormControl>
                                                                                    </FormItem>
                                                                                )}
                                                                            />
                                                                        </TableCell>
                                                                    ))}
                                                                </TableRow>
                                                            )) : (
                                                                <TableRow>
                                                                    <TableCell colSpan={permissionsConfig.length + 1} className="h-24 text-center">
                                                                        No roles defined. Add roles in the 'Company Details' tab.
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </TabsContent>
                                        </Tabs>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {hasSubDealers && (
                                <TabsContent value="sub-dealers">
                                    <Card>
                                        <CardHeader className="flex-row items-center justify-between">
                                            <div>
                                                <CardTitle>Sub Dealers</CardTitle>
                                                <CardDescription>Manage sub dealers associated with this organisation.</CardDescription>
                                            </div>
                                            <Button asChild>
                                                <Link href={`/organisations/${organisation.id}/add-sub-dealer`}>
                                                    <PlusCircle className="mr-2 h-4 w-4" />
                                                    Add Sub Dealer
                                                </Link>
                                            </Button>
                                        </CardHeader>
                                        <CardContent>
                                            {subDealersLoading ? (
                                                <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                                            ) : subDealers && subDealers.length > 0 ? (
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Name</TableHead>
                                                            <TableHead>Address</TableHead>
                                                            <TableHead>Phone</TableHead>
                                                            <TableHead className="text-right">Actions</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {subDealers.map(sd => (
                                                            <TableRow key={sd.id}>
                                                                <TableCell className="font-medium">{sd.name}</TableCell>
                                                                <TableCell>{sd.address || 'N/A'}</TableCell>
                                                                <TableCell>{sd.phoneNumber || 'N/A'}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button variant="ghost" size="sm" asChild>
                                                                        <Link href={`/organisations/${sd.slug || sd.id}`}>Manage</Link>
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <div className="text-center py-12 text-muted-foreground">
                                                    <p>No sub dealers have been added yet.</p>
                                                     <Button asChild variant="secondary" className="mt-4">
                                                        <Link href={`/organisations/${organisation.id}/add-sub-dealer`}>
                                                            <PlusCircle className="mr-2 h-4 w-4" />
                                                            Add First Sub Dealer
                                                        </Link>
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            )}
                        </Tabs>
                    </form>
                </Form>
            ) : (
                <Card><CardHeader><CardTitle>Organisation not found</CardTitle></CardHeader><CardContent><p>The requested organisation could not be found.</p></CardContent></Card>
            )}
        </>
    );
}
