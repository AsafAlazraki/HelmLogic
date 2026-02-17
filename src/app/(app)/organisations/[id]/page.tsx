'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';

import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2, Save, X, Mail, Building, Check, PlusCircle, Settings2 } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sendInviteEmail } from '@/ai/flows/send-invite-email-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn, createSlug } from '@/lib/utils';
import { ModuleVendorAccessDialog } from '@/components/module-vendor-access-dialog';


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
  slug: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  abn: z.string().nullable().optional(),
  primaryColor: hexColorValidation,
  accentColor: hexColorValidation,
  secondaryColor: hexColorValidation,
  roles: z.array(roleSchema).optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean().optional().nullable())).optional(),
  primaryLogo: z.any().optional(),
  secondaryLogo: z.any().optional(),
  primaryLogoUrl: z.string().nullable().optional(),
  secondaryLogoUrl: z.string().nullable().optional(),
  subDealersEnabled: z.boolean().optional(),
  dataWarehouseSubscriptions: z.array(z.string()).optional(),
  enabledModuleSubscriptions: z.array(z.string()).optional(),
  moduleAssociatedVendorAccess: z.record(z.string(), z.array(z.string())).optional(),
  dealerFitCategories: z.array(z.string()).optional(),
  parentOrganisationId: z.string().nullable().optional(),
});

type OrganisationFormData = z.infer<typeof formSchema>;

const inviteFormSchema = z.object({
    email: z.string().email({ message: 'Please enter a valid email address.' }),
    roleId: z.string().min(1, { message: 'Please select a role for the user.' }),
});

type InviteFormData = z.infer<typeof inviteFormSchema>;

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
}

interface Module {
    id: string;
    name: string;
    logoUrl?: string;
    mainVendorId: string;
    associatedVendorIds?: string[];
}

interface DealerFitCategory {
    id: string;
    name: string;
}

const permissionsConfig = [
    { id: 'can_access_module', label: 'Access Modules' },
    { id: 'can_create_quotes', label: 'Create Quotes' },
    { id: 'can_edit_boat_data', label: 'Edit Boat Data' },
    { id: 'can_view_subdealers', label: 'View Sub-Dealers' },
    { id: 'can_see_parent_inventory', label: 'Access Parent Inventory' },
    { id: 'can_access_settings', label: 'Access Settings' },
];

export default function OrganisationDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
    const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
    const [vendorToUnsubscribe, setVendorToUnsubscribe] = useState<Vendor | null>(null);
    const slugOrId = params.id as string;
    const firestore = useFirestore();
    const storage = useStorage();

    const [activeVendorConfigModule, setActiveVendorConfigModule] = useState<Module | null>(null);

    const orgQueryBySlug = useMemo(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'organisations'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);

    const { data: organisationsBySlug, loading: slugLoading } = useCollection<OrganisationFormData>(orgQueryBySlug);
    const { data: organisationById, loading: idLoading } = useDoc<OrganisationFormData>(slugOrId ? `/organisations/${slugOrId}` : null);

    const organisation = useMemo(() => organisationsBySlug?.[0] || organisationById, [organisationsBySlug, organisationById]);
    const orgLoading = slugLoading || idLoading;

    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');
    const { data: allModules, loading: modulesLoading } = useCollection<Module>('modules');
    const { data: allDealerFitCategories, loading: catsLoading } = useCollection<DealerFitCategory>('dealerFitCategories');

    const subDealersQuery = useMemo(() => {
        if (!organisation) return null;
        return query(collection(firestore, 'organisations'), where('parentOrganisationId', '==', organisation.id));
    }, [firestore, organisation]);

    const { data: subDealers, loading: subDealersLoading } = useCollection<OrganisationFormData>(subDealersQuery);

    const form = useForm<OrganisationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            permissions: {},
            roles: [],
            dataWarehouseSubscriptions: [],
            enabledModuleSubscriptions: [],
            dealerFitCategories: []
        },
    });

    const inviteForm = useForm<InviteFormData>({
        resolver: zodResolver(inviteFormSchema),
        defaultValues: { email: '', roleId: '' },
    });
    
    const watchedRoles = form.watch('roles');
    const watchedSubDealersEnabled = form.watch('subDealersEnabled');

    useEffect(() => {
        if (organisation) {
            // Deep clone permissions to avoid direct mutation issues
            const initialPermissions = JSON.parse(JSON.stringify(organisation.permissions || {}));
            (organisation.roles || []).forEach(role => {
                if (!initialPermissions[role.id]) {
                    initialPermissions[role.id] = {};
                }
            });

            form.reset({ 
                ...organisation, 
                permissions: initialPermissions,
                subDealersEnabled: organisation.subDealersEnabled || false,
                dataWarehouseSubscriptions: organisation.dataWarehouseSubscriptions || [],
                enabledModuleSubscriptions: organisation.enabledModuleSubscriptions || [],
                moduleAssociatedVendorAccess: organisation.moduleAssociatedVendorAccess || {},
                dealerFitCategories: organisation.dealerFitCategories || [],
            });
            if (organisation.primaryLogoUrl) setPrimaryLogoPreview(organisation.primaryLogoUrl);
            if (organisation.secondaryLogoUrl) setSecondaryLogoPreview(organisation.secondaryLogoUrl);
        }
    }, [organisation, form]);

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!organisation) return [];
        return [
            { href: '/admin', label: 'Admin' },
            { href: '/organisations', label: 'Organisations' },
            { href: `/organisations/${organisation.slug || organisation.id}`, label: organisation.name },
        ];
    }, [organisation]);

    async function onInviteSubmit(values: InviteFormData) {
        if (!organisation) return;
        setIsInviting(true);
        
        const roleName = organisation.roles?.find(r => r.id === values.roleId)?.name;
        if (!roleName) {
            toast({ variant: "destructive", title: "Invalid Role" });
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
                toast({ title: "Invite Sent", description: result.message });
                inviteForm.reset();
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "Failed to Send Invite", description: error.message });
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
                subDealersEnabled: values.subDealersEnabled || false,
                dataWarehouseSubscriptions: values.dataWarehouseSubscriptions || [],
                enabledModuleSubscriptions: values.enabledModuleSubscriptions || [],
                moduleAssociatedVendorAccess: values.moduleAssociatedVendorAccess || {},
                dealerFitCategories: values.dealerFitCategories || [],
            };
            
            if (values.primaryLogo instanceof File && storage) {
                const path = `organisations/${organisation.id}/logo/primary-${Date.now()}-${values.primaryLogo.name}`;
                dataToUpdate.primaryLogoUrl = await uploadFileToStorage(storage, values.primaryLogo, path);
            } else if (values.primaryLogoUrl === '') {
                dataToUpdate.primaryLogoUrl = null;
            } else if (organisation.primaryLogoUrl) {
                dataToUpdate.primaryLogoUrl = organisation.primaryLogoUrl;
            }
            
            if (values.secondaryLogo instanceof File && storage) {
                const path = `organisations/${organisation.id}/logo/secondary-${Date.now()}-${values.secondaryLogo.name}`;
                dataToUpdate.secondaryLogoUrl = await uploadFileToStorage(storage, values.secondaryLogo, path);
            } else if (values.secondaryLogoUrl === '') {
                dataToUpdate.secondaryLogoUrl = null;
            } else if (organisation.secondaryLogoUrl) {
                dataToUpdate.secondaryLogoUrl = organisation.secondaryLogoUrl;
            }

            await updateDoc(orgDocRef, dataToUpdate)
                .catch((serverError) => {
                    const permissionError = new FirestorePermissionError({
                        path: orgDocRef.path, operation: 'update', requestResourceData: dataToUpdate,
                    });
                    errorEmitter.emit('permission-error', permissionError);
                    throw serverError;
                });

            toast({ title: 'Organisation updated' });
            if (dataToUpdate.slug !== slugOrId) {
                router.replace(`/organisations/${dataToUpdate.slug}`);
            }

        } catch (error: any) {
            console.error("Failed to update organisation:", error);
            toast({ variant: 'destructive', title: 'Failed to update organisation', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    }

    const onInvalid = (errors: any) => {
        console.error("Form Validation Errors:", errors);
        toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Please check the form for errors. Missing required fields or invalid data types.",
        });
    };

    const handleDelete = async () => {
        if (!organisation) return;
        try {
            const orgDocRef = doc(firestore, 'organisations', organisation.id);
            await deleteDoc(orgDocRef).catch((serverError) => {
                const permissionError = new FirestorePermissionError({ path: orgDocRef.path, operation: 'delete' });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError;
            });
            toast({ title: 'Organisation deleted' });
            window.location.href = '/organisations';
        } catch (error) {
            console.error("Failed to delete organisation:", error);
            toast({ variant: 'destructive', title: 'Deletion failed' });
            setIsDeleteDialogOpen(false);
        }
    };

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

    const handleUpdateModuleVendorAccess = (moduleId: string, vendorIds: string[]) => {
        const currentAccess = form.getValues('moduleAssociatedVendorAccess') || {};
        form.setValue('moduleAssociatedVendorAccess', {
            ...currentAccess,
            [moduleId]: vendorIds
        }, { shouldDirty: true });
    };

    return (
        <AdminGuard>
            {orgLoading ? (
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            ) : organisation ? (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-semibold">Edit {organisation.name}</h1>
                                <BreadcrumbNav parts={breadcrumbParts} />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" /> Save Changes
                                </Button>
                            </div>
                        </div>

                        <Tabs defaultValue="details" className="space-y-4">
                            <TabsList className={`grid w-full ${watchedSubDealersEnabled ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                <TabsTrigger value="details">Company Details</TabsTrigger>
                                <TabsTrigger value="users">Users &amp; Permissions</TabsTrigger>
                                <TabsTrigger value="access">Access</TabsTrigger>
                                {watchedSubDealersEnabled && <TabsTrigger value="sub-dealers">Sub Dealers</TabsTrigger>}
                            </TabsList>
                            
                            <TabsContent value="details" className="space-y-8">
                                <div className="grid gap-8 lg:grid-cols-3">
                                    <div className="lg:col-span-2 space-y-8">
                                        <Card>
                                            <CardHeader><CardTitle>Organisation Details</CardTitle></CardHeader>
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
                                            <CardHeader><CardTitle>Role Hierarchy</CardTitle></CardHeader>
                                            <CardContent>
                                                <FormField control={form.control} name="roles" render={({ field }) => (<RoleHierarchyChart value={field.value || []} onChange={field.onChange} />)} />
                                            </CardContent>
                                        </Card>
                                    </div>
                                    <div className="lg:col-span-1 space-y-8">
                                        <Card>
                                            <CardHeader><CardTitle>Organisation Branding</CardTitle></CardHeader>
                                            <CardContent className="space-y-6">
                                                <ColorFormField name="primaryColor" label="Primary Color" description="The main brand color."/>
                                                <ColorFormField name="accentColor" label="Accent Color" description="Color for highlights and links."/>
                                                <ColorFormField name="secondaryColor" label="Secondary Color" description="Used for backgrounds and panels."/>
                                                <Separator />
                                                <FormField control={form.control} name="primaryLogo" render={({ field }) => (
                                                    <FormItem><FormLabel>Primary Logo</FormLabel>
                                                        {primaryLogoPreview && (
                                                            <div className="mt-2 w-32 h-32 relative group">
                                                                <Image src={primaryLogoPreview} alt="Primary Logo Preview" fill className="rounded-md object-contain border p-1" sizes="128px" />
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
                                                        <FormMessage />
                                                    </FormItem>
                                                )} />
                                                <FormField control={form.control} name="secondaryLogo" render={({ field }) => (
                                                    <FormItem><FormLabel>Secondary Logo</FormLabel>
                                                        {secondaryLogoPreview && (
                                                            <div className="mt-2 w-32 h-32 relative group">
                                                                <Image src={secondaryLogoPreview} alt="Secondary Logo Preview" fill className="rounded-md object-contain border p-1" sizes="128px" />
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
                                                        <FormMessage />
                                                    </FormItem>
                                                )} />
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                                <Card className="border-destructive">
                                    <CardHeader><CardTitle className="text-destructive">Danger Zone</CardTitle></CardHeader>
                                    <CardContent><p className="text-sm text-muted-foreground">Deleting this organisation is permanent and cannot be undone.</p></CardContent>
                                    <CardFooter>
                                        <Button variant="destructive" type="button" onClick={() => setIsDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete Organisation</Button>
                                    </CardFooter>
                                </Card>
                            </TabsContent>
                            
                            <TabsContent value="users">
                                <Card>
                                    <CardHeader><CardTitle>Users &amp; Permissions</CardTitle></CardHeader>
                                    <CardContent>
                                        <Tabs defaultValue="manage-users">
                                            <TabsList><TabsTrigger value="manage-users">Manage Users</TabsTrigger><TabsTrigger value="manage-permissions">Manage Permissions</TabsTrigger></TabsList>
                                            <TabsContent value="manage-users" className="pt-6">
                                                <h3 className="text-lg font-medium">Invite New User</h3>
                                                <Form {...inviteForm}>
                                                    <div className="mt-4 space-y-4 max-w-lg">
                                                        <FormField control={inviteForm.control} name="email" render={({ field }) => ( <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input placeholder="name@example.com" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                                        <FormField control={inviteForm.control} name="roleId" render={({ field }) => ( <FormItem><FormLabel>Role</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a role to assign" /></SelectTrigger></FormControl><SelectContent>{organisation.roles?.map(role => (<SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )} />
                                                        <Button type="button" disabled={isInviting} onClick={inviteForm.handleSubmit(onInviteSubmit)}>
                                                            {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                            <Mail className="mr-2 h-4 w-4" /> Send Invite
                                                        </Button>
                                                    </div>
                                                </Form>
                                            </TabsContent>
                                            <TabsContent value="manage-permissions" className="pt-6">
                                                <div className="mt-4 rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-1/3">Role</TableHead>
                                                                {permissionsConfig.map(p => <TableHead key={p.id} className="text-center">{p.label}</TableHead>)}
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {watchedRoles?.map((role) => (
                                                                <TableRow key={role.id}>
                                                                    <TableCell className="font-medium">{role.name}</TableCell>
                                                                    {permissionsConfig.map(permission => (
                                                                        <TableCell key={permission.id} className="text-center">
                                                                            <FormField control={form.control} name={`permissions.${role.id}.${permission.id}`} render={({ field }) => (
                                                                                <FormItem className="flex justify-center p-0 m-0"><FormControl><Checkbox checked={field.value || false} onCheckedChange={field.onChange} /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    ))}
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </TabsContent>
                                        </Tabs>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="access">
                                <div className="space-y-8">
                                    <Card>
                                        <CardHeader><CardTitle>Dealer Fit Subscriptions</CardTitle></CardHeader>
                                        <CardContent>
                                            {catsLoading ? (
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            ) : (
                                                <FormField control={form.control} name="dealerFitCategories" render={({ field }) => (
                                                    <FormItem className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                        {allDealerFitCategories?.map(cat => (
                                                            <div key={cat.id} className="flex items-center space-x-3 p-3 border rounded-md">
                                                                <Checkbox 
                                                                    checked={field.value?.includes(cat.id)}
                                                                    onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), cat.id]) : field.onChange(field.value?.filter(id => id !== cat.id))}
                                                                />
                                                                <label className="text-sm font-medium">{cat.name}</label>
                                                            </div>
                                                        ))}
                                                    </FormItem>
                                                )} />
                                            )}
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader><CardTitle>Sub Dealer Module</CardTitle></CardHeader>
                                        <CardContent>
                                            <FormField control={form.control} name="subDealersEnabled" render={({ field }) => (
                                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                                    <div className="space-y-0.5"><FormLabel className="text-base">Enable Sub Dealers</FormLabel><FormDescription>Allow this organisation to manage their own sub dealers.</FormDescription></div>
                                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                </FormItem>
                                            )} />
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader><CardTitle>Data Warehouse Subscriptions</CardTitle></CardHeader>
                                        <CardContent>
                                            {vendorsLoading ? (
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            ) : (
                                                <FormField control={form.control} name="dataWarehouseSubscriptions" render={({ field }) => (
                                                    <FormItem className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                                        {allVendors?.map((vendor) => {
                                                            const isSubscribed = field.value?.includes(vendor.id);
                                                            return (
                                                                <Card key={vendor.id} onClick={() => isSubscribed ? setVendorToUnsubscribe(vendor) : field.onChange([...(field.value || []), vendor.id])} className={cn("cursor-pointer transition-all border-border relative", isSubscribed && "border-primary ring-2 ring-primary")}>
                                                                    {isSubscribed && <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5 z-10"><Check className="h-3 w-3" /></div>}
                                                                    <div className="h-20 bg-muted/50 flex items-center justify-center p-2">
                                                                        {vendor.logoUrl ? <div className="relative h-full w-full"><Image src={vendor.logoUrl} alt={vendor.name} fill className="object-contain" sizes="100px" /></div> : <Building className="h-8 w-8 text-muted-foreground"/>}
                                                                    </div>
                                                                    <div className="p-3 text-center"><p className="text-sm font-medium truncate">{vendor.name}</p></div>
                                                                </Card>
                                                            );
                                                        })}
                                                    </FormItem>
                                                )} />
                                            )}
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader><CardTitle>Module Subscriptions</CardTitle></CardHeader>
                                        <CardContent>
                                            {modulesLoading ? (
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            ) : (
                                                <FormField control={form.control} name="enabledModuleSubscriptions" render={({ field }) => (
                                                    <FormItem className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {allModules?.map((module) => {
                                                            const isSubscribed = field.value?.includes(module.id);
                                                            return (
                                                                <Card key={module.id} className={cn("transition-all relative overflow-hidden flex flex-col", isSubscribed && "border-primary ring-1 ring-primary")}>
                                                                    <div className="flex items-start justify-between p-4 bg-muted/30">
                                                                        <div className="flex items-center gap-3"><Checkbox checked={isSubscribed} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), module.id]) : field.onChange(field.value?.filter(id => id !== module.id))} /><span className="font-medium text-sm">{module.name}</span></div>
                                                                        {isSubscribed && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setActiveVendorConfigModule(module)}><Settings2 className="h-4 w-4" /></Button>}
                                                                    </div>
                                                                    <div className="h-20 bg-muted/10 flex items-center justify-center p-2">{module.logoUrl ? <div className="relative h-full w-full"><Image src={module.logoUrl} alt={module.name} fill className="object-contain" sizes="100px" /></div> : <Building className="h-8 w-8 text-muted-foreground/30"/>}</div>
                                                                </Card>
                                                            );
                                                        })}
                                                    </FormItem>
                                                )} />
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            </TabsContent>

                            {watchedSubDealersEnabled && (
                                <TabsContent value="sub-dealers">
                                    <Card>
                                        <CardHeader className="flex-row items-center justify-between">
                                            <div><CardTitle>Sub Dealers</CardTitle></div>
                                            <Button asChild><Link href={`/organisations/${organisation.slug || organisation.id}/add-sub-dealer`}><PlusCircle className="mr-2 h-4 w-4" />Add Sub Dealer</Link></Button>
                                        </CardHeader>
                                        <CardContent>
                                            {subDealersLoading ? (
                                                <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                                            ) : subDealers && subDealers.length > 0 ? (
                                                <Table>
                                                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Address</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                                    <TableBody>
                                                        {subDealers.map(sd => (
                                                            <TableRow key={sd.id}><TableCell className="font-medium">{sd.name}</TableCell><TableCell>{sd.address || 'N/A'}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" asChild><Link href={`/organisations/${sd.slug || sd.id}`}>Manage</Link></Button></TableCell></TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <div className="text-center py-12 text-muted-foreground"><p>No sub dealers have been added yet.</p></div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            )}
                        </Tabs>
                    </form>
                </Form>
            ) : (
                <Card><CardHeader><CardTitle>Organisation not found</CardTitle></CardHeader></Card>
            )}

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete <strong>{organisation?.name}</strong> and all its data.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Yes, delete it</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={!!vendorToUnsubscribe} onOpenChange={(open) => !open && setVendorToUnsubscribe(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Confirm Unsubscription</AlertDialogTitle><AlertDialogDescription>Remove access to <strong>{vendorToUnsubscribe?.name}</strong> for this organisation?</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => setVendorToUnsubscribe(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => {
                        const currentSubs = form.getValues('dataWarehouseSubscriptions') || [];
                        form.setValue('dataWarehouseSubscriptions', currentSubs.filter((id) => id !== vendorToUnsubscribe?.id), { shouldDirty: true });
                        setVendorToUnsubscribe(null);
                    }} className="bg-destructive hover:bg-destructive/90">Yes, Unsubscribe</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {activeVendorConfigModule && organisation && (
                <ModuleVendorAccessDialog 
                    isOpen={!!activeVendorConfigModule}
                    setIsOpen={(open) => !open && setActiveVendorConfigModule(null)}
                    module={activeVendorConfigModule}
                    organisation={organisation as any}
                    allVendors={allVendors || []}
                    onUpdate={handleUpdateModuleVendorAccess}
                />
            )}
        </AdminGuard>
    );
}
