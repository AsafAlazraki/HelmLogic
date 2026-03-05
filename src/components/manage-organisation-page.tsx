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
import { collection, query, where, doc, updateDoc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Save, X, Mail, PlusCircle, DollarSign, Percent, TrendingUp, Settings2, Trash2, User, Copy, ExternalLink } from 'lucide-react';
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
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

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
    { id: 'can_access_pricing_manager', label: 'Pricing Manager' },
    { id: 'can_create_quotes', label: 'Create Quotes' },
    { id: 'can_edit_boat_data', label: 'Edit Boat Data' },
    { id: 'can_view_subdealers', label: 'View Sub-Dealers' },
    { id: 'can_access_price_book', label: 'Access Price Book' },
    { id: 'can_access_settings', label: 'Access Settings' },
];

function ExistingUsersList({ orgId, roles }: { orgId: string, roles: any[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const usersQuery = useMemoFirebase(() => 
        query(collection(firestore, 'users'), where('organisationId', '==', orgId)),
    [firestore, orgId]);
    
    const { data: orgUsers, loading } = useCollection(usersQuery);

    const handleRemoveUser = async (userId: string) => {
        try {
            await updateDoc(doc(firestore, 'users', userId), {
                organisationId: null,
                organisationRole: null,
            });
            toast({ title: "User Removed", description: "The user has been detached from this organisation." });
        } catch (e) {
            toast({ variant: "destructive", title: "Action Failed" });
        }
    };

    if (loading) return <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="mt-10 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold uppercase tracking-tight">Existing Members</h3>
                <Badge variant="secondary" className="font-black h-5">{orgUsers?.length || 0} Users</Badge>
            </div>
            <div className="rounded-xl border-2 overflow-hidden shadow-sm bg-white">
                <Table>
                    <TableHeader className="bg-muted/30">
                        <TableRow>
                            <TableHead className="font-black uppercase text-[10px] tracking-widest pl-6 py-4">User</TableHead>
                            <TableHead className="font-black uppercase text-[10px] tracking-widest">Email</TableHead>
                            <TableHead className="font-black uppercase text-[10px] tracking-widest">Role</TableHead>
                            <TableHead className="text-right pr-6"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orgUsers && orgUsers.length > 0 ? (
                            orgUsers.map(u => {
                                const roleName = roles?.find(r => r.id === u.organisationRole)?.name || u.organisationRole || 'Member';
                                return (
                                    <TableRow key={u.id} className="hover:bg-muted/5 group">
                                        <TableCell className="pl-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-[10px]">
                                                    {u.displayName?.[0] || u.email?.[0]?.toUpperCase() || 'U'}
                                                </div>
                                                <span className="font-bold text-sm">{u.displayName || 'N/A'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs font-medium text-muted-foreground">{u.email}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-black uppercase text-[9px] border-primary/20 text-primary bg-primary/5">
                                                {roleName}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                                                onClick={() => handleRemoveUser(u.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-16 text-muted-foreground italic text-sm">
                                    No members found in this organisation.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

export default function ManageOrganisationPage({ orgId }: { orgId: string }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
    const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
    const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
    const firestore = useFirestore();
    const storage = useStorage();

    const orgDocRef = useMemoFirebase(() => doc(firestore, 'organisations', orgId), [firestore, orgId]);
    const { data: organisation, loading: orgLoading } = useDoc<OrganisationFormData>(orgDocRef);
    
    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const { data: allVendors } = useCollection(vendorsQuery);

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

    useEffect(() => {
        if (organisation) {
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
        setLastInviteUrl(null);
        
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
                toast({ title: "Simulation Link Created", description: "Invite link is ready for testing." });
                setLastInviteUrl(result.inviteUrl || null);
                inviteForm.reset({ email: '', roleId: values.roleId });
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "Invite Failed", description: error.message });
        } finally {
            setIsInviting(false);
        }
    }

    async function onSubmit(values: OrganisationFormData) {
        if (!organisation) return;
        setIsSubmitting(true);
        
        try {
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
            }
            
            if (values.secondaryLogo instanceof File && storage) {
                const path = `organisations/${organisation.id}/logo/secondary-${Date.now()}-${values.secondaryLogo.name}`;
                dataToUpdate.secondaryLogoUrl = await uploadFileToStorage(storage, values.secondaryLogo, path);
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

        } catch (error: any) {
            console.error("Failed to update organisation:", error);
            toast({ variant: 'destructive', title: 'Failed to update organisation', description: error.message });
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
                            <TabsList className={cn("grid w-full", organisation.subDealersEnabled ? 'grid-cols-4' : 'grid-cols-3')}>
                                <TabsTrigger value="details">Company Details</TabsTrigger>
                                <TabsTrigger value="users">Users &amp; Permissions</TabsTrigger>
                                <TabsTrigger value="margins">Margins</TabsTrigger>
                                {organisation.subDealersEnabled && <TabsTrigger value="sub-dealers">Sub Dealers</TabsTrigger>}
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
                                            <CardHeader><CardTitle>Role Hierarchy</CardTitle><CardDescription>Build the organisation's role structure.</CardDescription></CardHeader>
                                            <CardContent>
                                                <FormField control={form.control} name="roles" render={({ field }) => (<RoleHierarchyChart value={field.value || []} onChange={field.onChange} />)} />
                                            </CardContent>
                                        </Card>
                                    </div>
                                    <div className="lg:col-span-1 space-y-8">
                                        <Card>
                                            <CardHeader><CardTitle>Financial Logic</CardTitle></CardHeader>
                                            <CardContent className="space-y-6">
                                                <FormField control={form.control} name="tradingCurrency" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Trading Currency</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                            <SelectContent>{SUPPORTED_CURRENCIES.map(curr => (<SelectItem key={curr.code} value={curr.code}>{curr.label}</SelectItem>))}</SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )} />
                                                <FormField control={form.control} name="gstPercentage" render={({ field }) => (
                                                    <FormItem><FormLabel>GST / Tax Percentage</FormLabel><FormControl><div className="relative"><Input type="number" step="0.1" {...field} className="pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span></div></FormControl></FormItem>
                                                )} />
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
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
                                                                <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={() => { setPrimaryLogoPreview(null); form.setValue('primaryLogoUrl', ''); field.onChange(null); }}><X className="h-4 w-4" /></Button>
                                                            </div>
                                                        )}
                                                        <FormControl><Input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; field.onChange(file); setPrimaryLogoPreview(file ? URL.createObjectURL(file) : null); }} /></FormControl>
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
                                        <CardDescription>Invite new members and manage their roles.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Tabs defaultValue="manage-users">
                                            <TabsList>
                                                <TabsTrigger value="manage-users">Manage Users</TabsTrigger>
                                                <TabsTrigger value="manage-permissions">Manage Permissions</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="manage-users" className="pt-6 space-y-8">
                                                <div className="p-6 border-2 border-dashed rounded-2xl bg-muted/5">
                                                    <h3 className="text-base font-black uppercase tracking-tight mb-4">Invite New User</h3>
                                                    <Form {...inviteForm}>
                                                        <div className="grid md:grid-cols-2 gap-6 items-end">
                                                            <FormField control={inviteForm.control} name="email" render={({ field }) => ( 
                                                                <FormItem>
                                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email Address</FormLabel>
                                                                    <FormControl><Input placeholder="name@example.com" {...field} className="h-10 font-bold" /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem> 
                                                            )} />
                                                            <FormField control={inviteForm.control} name="roleId" render={({ field }) => ( 
                                                                <FormItem>
                                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assigned Role</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                                        <FormControl><SelectTrigger className="h-10 font-bold"><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            {organisation.roles?.map(role => (
                                                                                <SelectItem key={role.id} value={role.id} className="font-bold">{role.name}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage />
                                                                </FormItem> 
                                                            )} />
                                                        </div>
                                                        <Button type="button" disabled={isInviting} onClick={inviteForm.handleSubmit(onInviteSubmit)} className="mt-6 h-10 px-8 font-black uppercase tracking-widest text-[10px] shadow-lg">
                                                            {isInviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                                                            Send Simulation Invite
                                                        </Button>
                                                    </Form>

                                                    {lastInviteUrl && (
                                                        <div className="mt-6 p-4 rounded-xl bg-primary/5 border-2 border-primary/20 animate-in fade-in slide-in-from-top-2">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                                        <Settings2 className="h-4 w-4" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Simulation Link Created</p>
                                                                        <p className="text-[11px] font-medium text-muted-foreground">Emails are simulated. Use this link to join as the new user:</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase border-2" onClick={() => { navigator.clipboard.writeText(lastInviteUrl); toast({ title: "Copied" }); }}>
                                                                        <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                                                                    </Button>
                                                                    <Button variant="secondary" size="sm" className="h-8 text-[10px] font-black uppercase" asChild>
                                                                        <a href={lastInviteUrl} target="_blank" rel="noopener noreferrer">
                                                                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Test Sign-up
                                                                        </a>
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <ExistingUsersList orgId={organisation.id} roles={organisation.roles || []} />
                                            </TabsContent>
                                            <TabsContent value="manage-permissions" className="pt-6">
                                                <div className="mt-4 rounded-xl border-2 overflow-hidden shadow-sm">
                                                    <Table>
                                                        <TableHeader className="bg-muted/30">
                                                            <TableRow>
                                                                <TableHead className="w-1/3 font-black uppercase text-[10px] tracking-widest pl-6 py-4">Role</TableHead>
                                                                {permissionsConfig.map(p => <TableHead key={p.id} className="text-center font-black uppercase text-[10px] tracking-widest">{p.label}</TableHead>)}
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {watchedRoles?.map((role) => (
                                                                <TableRow key={role.id} className="hover:bg-muted/5">
                                                                    <TableCell className="font-bold text-sm pl-6">{role.name}</TableCell>
                                                                    {permissionsConfig.map(permission => (
                                                                        <TableCell key={permission.id} className="text-center">
                                                                            <FormField control={form.control} name={`permissions.${role.id}.${permission.id}`} render={({ field }) => (
                                                                                <FormItem className="flex justify-center p-0 m-0">
                                                                                    <FormControl>
                                                                                        <Checkbox checked={field.value || false} onCheckedChange={field.onChange} />
                                                                                    </FormControl>
                                                                                </FormItem>
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

                            <TabsContent value="margins">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <Card>
                                        <CardHeader>
                                            <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /><CardTitle>Brand Margins</CardTitle></div>
                                            <CardDescription>Default margin overrides for specific brands.</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {watchedBrandSubscriptions.length > 0 ? (
                                                <div className="space-y-4">
                                                    {watchedBrandSubscriptions.map(vId => {
                                                        const vendor = (allVendors as any)?.find((v:any) => v.id === vId);
                                                        if (!vendor) return null;
                                                        return (
                                                            <FormField key={vId} control={form.control} name={`brandMargins.${vId}`} render={({ field }) => (
                                                                <FormItem className="flex items-center justify-between p-3 border rounded-xl bg-muted/5">
                                                                    <FormLabel className="font-black uppercase text-[10px] tracking-tight">{vendor.name}</FormLabel>
                                                                    <FormControl><div className="relative w-24"><Input type="number" step="0.1" {...field} className="pr-8 h-8 text-right font-bold" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">%</span></div></FormControl>
                                                                </FormItem>
                                                            )} />
                                                        );
                                                    })}
                                                </div>
                                            ) : <p className="text-center py-8 text-muted-foreground text-xs italic">No brand subscriptions found.</p>}
                                        </CardContent>
                                    </Card>
                                </div>
                            </TabsContent>

                            {organisation.subDealersEnabled && (
                                <TabsContent value="sub-dealers">
                                    <Card>
                                        <CardHeader className="flex-row items-center justify-between">
                                            <CardTitle>Sub Dealer Network</CardTitle>
                                            <Button asChild className="h-9 px-6 font-black uppercase text-[10px] tracking-widest"><Link href={`/organisations/${organisation.id}/add-sub-dealer`}><PlusCircle className="mr-2 h-4 w-4" />Register Sub Dealer</Link></Button>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-center py-16 text-muted-foreground opacity-20 flex flex-col items-center gap-3">
                                                <User className="h-12 w-12" />
                                                <p className="font-black uppercase tracking-widest text-xs">Sub Dealer Directory Synchronized</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            )}
                        </Tabs>
                    </form>
                </Form>
            ) : null}
        </>
    );
}
