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
import { useFirestore, useStorage, useMemoFirebase } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Save, X, Mail, PlusCircle, DollarSign, Percent, TrendingUp, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { RoleHierarchyChart } from '@/components/role-hierarchy-chart';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sendInviteEmail } from '@/ai/flows/send-invite-email-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { SUPPORTED_CURRENCIES } from '@/lib/currency-utils';


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
  permissions: z.record(z.string(), z.record(z.string(), z.boolean().optional().nullable())).optional(),
  primaryLogo: z.any().optional(),
  secondaryLogo: z.any().optional(),
  primaryLogoUrl: z.string().nullable().optional(),
  secondaryLogoUrl: z.string().nullable().optional(),
  subDealersEnabled: z.boolean().optional(),
  tradingCurrency: z.string().default('AUD'),
  gstPercentage: z.coerce.number().min(0).max(100).default(10),
  brandMargins: z.record(z.string(), z.coerce.number()).optional(),
  moduleMargins: z.record(z.string(), z.coerce.number()).optional(),
  dataWarehouseSubscriptions: z.array(z.string()).optional(),
  enabledModuleSubscriptions: z.array(z.string()).optional(),
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
    { id: 'can_access_module', label: 'Access Modules' },
    { id: 'can_create_quotes', label: 'Create Quotes' },
    { id: 'can_edit_boat_data', label: 'Edit Boat Data' },
    { id: 'can_view_subdealers', label: 'View Sub-Dealers' },
    { id: 'can_access_price_book', label: 'Access Price Book' },
    { id: 'can_access_settings', label: 'Access Settings' },
];

export default function ManageOrganisationPage({ orgId }: { orgId: string }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
    const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
    const firestore = useFirestore();
    const storage = useStorage();

    const orgDocRef = useMemoFirebase(() => doc(firestore, 'organisations', orgId), [firestore, orgId]);
    const { data: organisation, loading: orgLoading } = useDoc<OrganisationFormData>(orgDocRef);
    
    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const modulesQuery = useMemoFirebase(() => collection(firestore, 'modules'), [firestore]);
    const { data: allVendors } = useCollection(vendorsQuery);
    const { data: allModules } = useCollection(modulesQuery);

    const subDealersQuery = useMemoFirebase(() => {
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
            tradingCurrency: 'AUD',
            gstPercentage: 10,
            brandMargins: {},
            moduleMargins: {},
        },
    });

    const inviteForm = useForm<InviteFormData>({
        resolver: zodResolver(inviteFormSchema),
        defaultValues: { email: '', roleId: '' },
    });
    
    const watchedRoles = form.watch('roles');
    const watchedBrandSubscriptions = form.watch('dataWarehouseSubscriptions') || [];
    const watchedModuleSubscriptions = form.watch('enabledModuleSubscriptions') || [];

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
                tradingCurrency: organisation.tradingCurrency || 'AUD',
                gstPercentage: organisation.gstPercentage ?? 10,
                brandMargins: organisation.brandMargins || {},
                moduleMargins: organisation.moduleMargins || {},
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
                tradingCurrency: values.tradingCurrency,
                gstPercentage: values.gstPercentage,
                brandMargins: values.brandMargins || {},
                moduleMargins: values.moduleMargins || {},
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

    const onInvalid = (errors: any) => {
        console.error("Form Validation Errors:", errors);
        toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Please check the form for errors. Missing required fields or invalid data types.",
        });
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

    const hasSubDealers = organisation?.subDealersEnabled;

    return (
        <>
            {orgLoading ? (
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            ) : organisation ? (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
                        <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" /> Save Changes
                            </Button>
                        </div>

                        <Tabs defaultValue="details" className="space-y-4">
                            <TabsList className={`grid w-full ${hasSubDealers ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                <TabsTrigger value="details">Company Details</TabsTrigger>
                                <TabsTrigger value="users">Users &amp; Permissions</TabsTrigger>
                                <TabsTrigger value="margins">Margins</TabsTrigger>
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
                                            <CardHeader>
                                                <CardTitle>Financial Logic</CardTitle>
                                                <CardDescription>Global financial settings for this organisation.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-6">
                                                <FormField
                                                    control={form.control}
                                                    name="tradingCurrency"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="flex items-center gap-2">
                                                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                                                                Trading Currency
                                                            </FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select currency" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    {SUPPORTED_CURRENCIES.map(curr => (
                                                                        <SelectItem key={curr.code} value={curr.code}>{curr.label}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <FormDescription>The primary currency used for quoting and local pricing.</FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="gstPercentage"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="flex items-center gap-2">
                                                                <Percent className="h-4 w-4 text-muted-foreground" />
                                                                GST / Tax Percentage
                                                            </FormLabel>
                                                            <FormControl>
                                                                <div className="relative">
                                                                    <Input type="number" step="0.1" {...field} className="pr-8" />
                                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                                                                </div>
                                                            </FormControl>
                                                            <FormDescription>The applicable tax rate for this organisation's region.</FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </CardContent>
                                        </Card>
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
                                                        <FormDescription>Upload a new logo to replace the existing one.</FormDescription><FormMessage />
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

                            <TabsContent value="margins">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <Card>
                                        <CardHeader>
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="h-5 w-5 text-primary" />
                                                <CardTitle>Required Brand Margins</CardTitle>
                                            </div>
                                            <CardDescription>Set the default required margin for each brand this organisation is subscribed to.</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {watchedBrandSubscriptions.length > 0 ? (
                                                <div className="space-y-4">
                                                    {watchedBrandSubscriptions.map(vendorId => {
                                                        const vendor = allVendors?.find((v: any) => v.id === vendorId);
                                                        if (!vendor) return null;
                                                        return (
                                                            <FormField
                                                                key={vendorId}
                                                                control={form.control}
                                                                name={`brandMargins.${vendorId}`}
                                                                render={({ field }) => (
                                                                    <FormItem className="flex items-center justify-between space-y-0 p-3 border rounded-md">
                                                                        <FormLabel className="font-medium">{vendor.name}</FormLabel>
                                                                        <FormControl>
                                                                            <div className="relative w-24">
                                                                                <Input type="number" step="0.1" {...field} className="pr-8 h-8 text-right font-bold" />
                                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                                                                            </div>
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground italic text-center py-8">Subscribe to brands in the admin portal to set margins.</p>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <div className="flex items-center gap-2">
                                                <Settings2 className="h-5 w-5 text-primary" />
                                                <CardTitle>Module Price Margins</CardTitle>
                                            </div>
                                            <CardDescription>Apply specific price margins within modules to override defaults.</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {watchedModuleSubscriptions.length > 0 ? (
                                                <div className="space-y-4">
                                                    {watchedModuleSubscriptions.map(moduleId => {
                                                        const module = allModules?.find((m: any) => m.id === moduleId);
                                                        if (!module) return null;
                                                        return (
                                                            <FormField
                                                                key={moduleId}
                                                                control={form.control}
                                                                name={`moduleMargins.${moduleId}`}
                                                                render={({ field }) => (
                                                                    <FormItem className="flex items-center justify-between space-y-0 p-3 border rounded-md">
                                                                        <FormLabel className="font-medium">{module.name}</FormLabel>
                                                                        <FormControl>
                                                                            <div className="relative w-24">
                                                                                <Input type="number" step="0.1" {...field} className="pr-8 h-8 text-right font-bold" />
                                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                                                                            </div>
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground italic text-center py-8">Subscribe to modules in the admin portal to set margins.</p>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
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
                                                <div className="flex justify-center items-center py-12"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
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
                                                                        <Link href={`/sub-dealers/${sd.slug || sd.id}`}>Manage</Link>
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