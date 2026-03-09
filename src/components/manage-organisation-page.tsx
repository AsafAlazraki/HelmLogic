'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';

import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useStorage, useMemoFirebase } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, query, where, doc, updateDoc, deleteDoc, serverTimestamp, setDoc, orderBy } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2, Save, X, Mail, Building, Check, PlusCircle, Settings2, Percent, TrendingUp, Hash, FileSpreadsheet, ChevronRight, Waves, Zap, ScrollText, Pencil, UserPlus, Key, ShieldCheck, Smartphone, Phone, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { SUPPORTED_CURRENCIES } from '@/lib/currency-utils';
import { Badge } from '@/components/ui/badge';
import { cn, createSlug } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useUser } from '@/firebase/auth/use-user';

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
  shortCode: z.string().max(10).nullable().optional(),
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

const addUserFormSchema = z.object({
    email: z.string().email({ message: 'Please enter a valid email address.' }),
    password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
    roleId: z.string().min(1, { message: 'Please select a role for the user.' }),
    phoneNumber: z.string().optional(),
});

type AddUserFormData = z.infer<typeof addUserFormSchema>;

const permissionsConfig = [
    { id: 'can_access_module', label: 'Access Modules' },
    { id: 'can_access_pricing_manager', label: 'Pricing Manager' },
    { id: 'can_create_quotes', label: 'Create Quotes' },
    { id: 'can_edit_boat_data', label: 'Edit Boat Data' },
    { id: 'can_view_subdealers', label: 'View Sub-Dealers' },
    { id: 'can_access_price_book', label: 'Access Price Book' },
    { id: 'can_access_settings', label: 'Access Settings' },
];

function CreateBlueprintDialog({ isOpen, onOpenChange, orgId, allModules }: { isOpen: boolean, onOpenChange: (open: boolean) => void, orgId: string, allModules: any[] }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState<'Quote' | 'Invoice' | 'Contract'>('Quote');
    const [moduleId, setModuleId] = useState('');

    const handleCreate = async () => {
        if (!user || !name.trim() || !orgId || !moduleId) return;
        setIsLoading(true);
        try {
            const templateRef = doc(collection(firestore, `organisations/${orgId}/templates`));
            const templateData = {
                id: templateRef.id,
                name,
                type,
                moduleId,
                createdByUserId: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                pages: [
                    { id: 'page-1', blocks: [], headerHeight: 20, footerHeight: 20, order: 1 }
                ]
            };
            await setDoc(templateRef, templateData);
            
            toast({ title: "Blueprint Created" });
            router.push(`/modules/${moduleId}/templates/${templateRef.id}`);
        } catch (e) {
            toast({ variant: 'destructive', title: "Failed to create template" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-[2rem] border-4 shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-8 border-b bg-muted/5">
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">New Blueprint</DialogTitle>
                    <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Universal Document Architecture</DialogDescription>
                </DialogHeader>
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Template Name</Label>
                        <Input placeholder="e.g. Premium Sales Proposal" value={name} onChange={e => setName(e.target.value)} className="h-12 font-bold border-2 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Linked Module</Label>
                        <Select value={moduleId} onValueChange={setModuleId}>
                            <SelectTrigger className="h-12 font-black text-xs border-2 rounded-xl bg-background">
                                <SelectValue placeholder="Select target module..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                                {allModules.map(m => (
                                    <SelectItem key={m.id} value={m.id} className="text-[10px] font-bold uppercase py-2.5">{m.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Document Class</Label>
                        <Select value={type} onValueChange={(v: any) => setType(v)}>
                            <SelectTrigger className="h-12 font-black text-xs border-2 rounded-xl bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                                <SelectItem value="Quote" className="text-[10px] font-bold uppercase py-2.5">Sales Quote</SelectItem>
                                <SelectItem value="Invoice" className="text-[10px] font-bold uppercase py-2.5">Pro-Forma Invoice</SelectItem>
                                <SelectItem value="Contract" className="text-[10px] font-bold uppercase py-2.5">Purchase Agreement</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                    <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2">Cancel</Button></DialogClose>
                    <Button onClick={handleCreate} disabled={!name.trim() || !moduleId || isLoading} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl bg-primary text-white">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlusCircle className="h-4 w-4 mr-2" />}
                        Generate Editor
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ExistingUsersList({ orgId, roles }: { orgId: string, roles: any[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    const usersQuery = useMemoFirebase(() => 
        query(collection(firestore, 'users'), where('organisationId', '==', orgId)),
    [firestore, orgId]);
    
    const { data: orgUsers, loading } = useCollection(usersQuery);

    const handleSaveMemberUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setIsSavingEdit(true);
        try {
            const userRef = doc(firestore, 'users', editingUser.id);
            await updateDoc(userRef, {
                displayName: editingUser.displayName || '',
                phoneNumber: editingUser.phoneNumber || '',
                organisationRole: editingUser.organisationRole,
            });
            toast({ title: "Member updated" });
            setEditingUser(null);
        } catch (error) {
            toast({ variant: "destructive", title: "Update failed" });
        } finally {
            setIsSavingEdit(false);
        }
    };

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
                            <TableHead className="font-black uppercase text-[10px] tracking-widest">Email & Contact</TableHead>
                            <TableHead className="font-black uppercase text-[10px] tracking-widest">Role</TableHead>
                            <TableHead className="text-right pr-6"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orgUsers && orgUsers.length > 0 ? (
                            orgUsers.map(u => {
                                const roleName = roles?.find(r => r.id === u.organisationRole)?.name || u.organisationRole || 'Member';
                                return (
                                    <TableRow key={u.id} className="hover:bg-muted/5 group cursor-pointer" onClick={() => setEditingUser(u)}>
                                        <TableCell className="pl-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-[10px]">
                                                    {u.displayName?.[0] || u.email?.[0]?.toUpperCase() || 'U'}
                                                </div>
                                                <span className="font-bold text-sm">{u.displayName || 'N/A'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs font-medium text-muted-foreground">{u.email}</span>
                                                {u.phoneNumber && (
                                                    <span className="text-[9px] font-mono font-bold text-primary flex items-center gap-1">
                                                        <Smartphone className="h-2.5 w-2.5" />
                                                        {u.phoneNumber}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-black uppercase text-[9px] border-primary/20 text-primary bg-primary/5">
                                                {roleName}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                                                    onClick={(e) => { e.stopPropagation(); handleRemoveUser(u.id); }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
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

            <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 border-b bg-muted/5">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight italic">Edit Member</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Profile & Role Matrix</DialogDescription>
                    </DialogHeader>
                    {editingUser && (
                        <form onSubmit={handleSaveMemberUpdate}>
                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Member Display Name</Label>
                                    <Input 
                                        value={editingUser.displayName || ''} 
                                        onChange={e => setEditingUser({ ...editingUser, displayName: e.target.value })}
                                        className="h-12 font-bold border-2 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Mobile Number (Optional)</Label>
                                    <div className="relative">
                                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                        <Input 
                                            value={editingUser.phoneNumber || ''} 
                                            onChange={e => setEditingUser({ ...editingUser, phoneNumber: e.target.value })}
                                            className="h-12 pl-10 font-bold border-2 rounded-xl"
                                            placeholder="e.g. +61 400 000 000"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Assigned Role</Label>
                                    <Select 
                                        value={editingUser.organisationRole || ''} 
                                        onValueChange={v => setEditingUser({ ...editingUser, organisationRole: v })}
                                    >
                                        <SelectTrigger className="h-12 font-black text-xs border-2 rounded-xl bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl border-2">
                                            {roles.map(role => (
                                                <SelectItem key={role.id} value={role.id} className="text-[10px] font-bold uppercase py-2.5">{role.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                                <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2">Cancel</Button></DialogClose>
                                <Button type="submit" disabled={isSavingEdit} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl bg-primary text-white">
                                    {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    Update Profile
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function ManageOrganisationPage({ orgId }: { orgId: string }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
    const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
    const [isCreateBlueprintOpen, setIsCreateBlueprintOpen] = useState(false);
    
    const firestore = useFirestore();
    const storage = useStorage();

    const orgDocRef = useMemoFirebase(() => doc(firestore, 'organisations', orgId), [firestore, orgId]);
    const { data: organisation, loading: orgLoading } = useDoc<OrganisationFormData>(orgDocRef);

    const modulesQuery = useMemoFirebase(() => collection(firestore, 'modules'), [firestore]);
    const { data: allModules } = useCollection<any>(modulesQuery);

    const templatesQuery = useMemoFirebase(() => {
        if (!orgId) return null;
        return query(collection(firestore, `organisations/${orgId}/templates`), orderBy('createdAt', 'desc'));
    }, [firestore, orgId]);
    const { data: templates, loading: templatesLoading } = useCollection<any>(templatesQuery);
    
    const form = useForm<OrganisationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            shortCode: '',
            permissions: {},
            roles: [],
            tradingCurrency: 'AUD',
            gstPercentage: 10,
            brandMargins: {},
            moduleMargins: {},
        },
    });

    const addUserForm = useForm<AddUserFormData>({
        resolver: zodResolver(addUserFormSchema),
        defaultValues: { email: '', password: '', roleId: '', phoneNumber: '' },
    });
    
    const watchedRoles = form.watch('roles');

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
                shortCode: organisation.shortCode || '',
            });
            if (organisation.primaryLogoUrl) setPrimaryLogoPreview(organisation.primaryLogoUrl);
            if (organisation.secondaryLogoUrl) setSecondaryLogoPreview(organisation.secondaryLogoUrl);
        }
    }, [organisation, form]);

    async function onAddUserSubmit() {
        if (!organisation) return;
        const values = addUserForm.getValues();
        setIsAddingUser(true);
        
        const tempAppName = `temp-enroller-${Date.now()}`;
        let tempApp;

        try {
            tempApp = initializeApp(firebaseConfig, tempAppName);
            const tempAuth = getAuth(tempApp);

            const userCredential = await createUserWithEmailAndPassword(tempAuth, values.email, values.password);
            const newUser = userCredential.user;

            const userRef = doc(firestore, 'users', newUser.uid);
            const profileData = {
                id: newUser.uid,
                email: values.email,
                phoneNumber: values.phoneNumber || null,
                organisationId: organisation.id,
                organisationRole: values.roleId,
                appRole: 'General User',
                createdAt: serverTimestamp(),
            };

            await setDoc(userRef, profileData).catch(e => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: userRef.path,
                    operation: 'create',
                    requestResourceData: profileData
                }));
                throw e;
            });

            await signOut(tempAuth);

            toast({ title: "User Created", description: `${values.email} has been added to ${organisation.name}.` });
            addUserForm.reset({ email: '', password: '', roleId: values.roleId, phoneNumber: '' });

        } catch (error: any) {
            console.error("Failed to add user:", error);
            toast({ variant: "destructive", title: "User Creation Failed", description: error.message });
        } finally {
            setIsAddingUser(false);
        }
    }

    async function onSubmit(values: OrganisationFormData) {
        if (!organisation) return;
        setIsSubmitting(true);
        
        try {
            const dataToUpdate: { [key: string]: any } = {
                name: values.name,
                slug: createSlug(values.name),
                shortCode: values.shortCode || '',
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

            await updateDoc(orgDocRef, dataToUpdate);
            toast({ title: 'Organisation updated' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update failed', description: error.message });
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
                <FormProvider {...form}>
                    <div className="space-y-4">
                        <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
                            <Button type="button" onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" /> Save Changes
                            </Button>
                        </div>

                        <Tabs defaultValue="details" className="space-y-4">
                            <TabsList className={cn("grid w-full", organisation.subDealersEnabled ? 'grid-cols-5' : 'grid-cols-4')}>
                                <TabsTrigger value="details">Company Details</TabsTrigger>
                                <TabsTrigger value="users">Users & Permissions</TabsTrigger>
                                <TabsTrigger value="blueprints">Blueprints</TabsTrigger>
                                <TabsTrigger value="margins">Margins</TabsTrigger>
                                {organisation.subDealersEnabled && <TabsTrigger value="sub-dealers">Sub Dealers</TabsTrigger>}
                            </TabsList>
                            
                            <TabsContent value="details" className="space-y-8">
                                <div className="grid gap-8 lg:grid-cols-3">
                                    <div className="lg:col-span-2 space-y-8">
                                        <Card>
                                            <CardHeader><CardTitle>Organisation Details</CardTitle></CardHeader>
                                            <CardContent className="space-y-6">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <FormField control={form.control} name="name" render={({ field }) => (
                                                        <FormItem className="md:col-span-2">
                                                            <FormLabel>Organisation Name</FormLabel>
                                                            <FormControl><Input placeholder="e.g., Northside Marine" {...field} value={field.value ?? ''} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                    <FormField control={form.control} name="shortCode" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="flex items-center gap-2">
                                                                <Hash className="h-3.5 w-3.5" />
                                                                Selling Short Code
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="e.g., NSM" {...field} value={field.value ?? ''} className="font-black uppercase" />
                                                            </FormControl>
                                                            <FormDescription>Used for dynamic price columns.</FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                </div>
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
                                        <CardTitle>Users & Permissions</CardTitle>
                                        <CardDescription>Directly manage organisation members and their access levels.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Tabs defaultValue="manage-users">
                                            <TabsList>
                                                <TabsTrigger value="manage-users">Manage Users</TabsTrigger>
                                                <TabsTrigger value="manage-permissions">Manage Permissions</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="manage-users" className="pt-6 space-y-8">
                                                <div className="p-6 border-2 border-dashed rounded-2xl bg-muted/5 shadow-inner">
                                                    <div className="flex items-center justify-between mb-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                                <UserPlus className="h-5 w-5" />
                                                            </div>
                                                            <h3 className="text-base font-black uppercase tracking-tight">Direct User Enrollment</h3>
                                                        </div>
                                                        <Button 
                                                            type="button"
                                                            onClick={addUserForm.handleSubmit(onAddUserSubmit)}
                                                            disabled={isAddingUser} 
                                                            className="h-11 px-10 font-black uppercase tracking-widest text-[10px] shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                                                        >
                                                            {isAddingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                                            Enroll Member
                                                        </Button>
                                                    </div>
                                                    
                                                    <FormProvider {...addUserForm}>
                                                        <div className="space-y-6">
                                                            <div className="grid md:grid-cols-4 gap-6">
                                                                <FormField control={addUserForm.control} name="email" render={({ field }) => ( 
                                                                    <FormItem>
                                                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Log-in Email</FormLabel>
                                                                        <FormControl>
                                                                            <div className="relative">
                                                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                                                                <Input placeholder="name@example.com" {...field} className="h-11 pl-10 font-bold bg-background border-2 transition-all focus-visible:ring-primary/20" />
                                                                            </div>
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                    </FormItem> 
                                                                )} />
                                                                <FormField control={addUserForm.control} name="password" render={({ field }) => ( 
                                                                    <FormItem>
                                                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Secret Password</FormLabel>
                                                                        <FormControl>
                                                                            <div className="relative">
                                                                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                                                                <Input type="password" placeholder="••••••••" {...field} className="h-11 pl-10 font-bold bg-background border-2 transition-all focus-visible:ring-primary/20" />
                                                                            </div>
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                    </FormItem> 
                                                                )} />
                                                                <FormField control={addUserForm.control} name="phoneNumber" render={({ field }) => ( 
                                                                    <FormItem>
                                                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mobile (Optional)</FormLabel>
                                                                        <FormControl>
                                                                            <div className="relative">
                                                                                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                                                                <Input placeholder="+61 400 000 000" {...field} className="h-11 pl-10 font-bold bg-background border-2 transition-all focus-visible:ring-primary/20" />
                                                                            </div>
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                    </FormItem> 
                                                                )} />
                                                                <FormField control={addUserForm.control} name="roleId" render={({ field }) => ( 
                                                                    <FormItem>
                                                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Organisation Role</FormLabel>
                                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                                            <FormControl>
                                                                                <SelectTrigger className="h-11 font-bold border-2 bg-background">
                                                                                    <SelectValue placeholder="Assign a role" />
                                                                                </SelectTrigger>
                                                                            </FormControl>
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
                                                            <div className="flex items-center justify-between pt-4 border-t border-dashed">
                                                                <p className="text-[10px] text-muted-foreground font-medium italic">New users will be created in Firebase Auth and added to this organisation instantly.</p>
                                                            </div>
                                                        </div>
                                                    </FormProvider>
                                                </div>

                                                <ExistingUsersList orgId={organisation.id} roles={organisation.roles || []} />
                                            </TabsContent>
                                            <TabsContent value="manage-permissions" className="pt-6">
                                                <div className="mt-4 rounded-xl border-2 overflow-hidden shadow-sm bg-white">
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

                            <TabsContent value="blueprints">
                                <Card className="border-2 rounded-[2.5rem] overflow-hidden shadow-sm">
                                    <CardHeader className="p-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                                                <Waves className="h-3.5 w-3.5" />
                                                <span>Architectural Assets</span>
                                            </div>
                                            <CardTitle className="text-2xl font-black uppercase tracking-tight italic">Company Blueprints</CardTitle>
                                            <CardDescription className="text-xs uppercase font-black text-muted-foreground tracking-widest">Universal document architecture for {organisation?.name}.</CardDescription>
                                        </div>
                                        <Button 
                                            type="button" 
                                            className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl"
                                            onClick={() => setIsCreateBlueprintOpen(true)}
                                        >
                                            <PlusCircle className="mr-2 h-4 w-4" /> Initialize New Template
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        {templatesLoading ? (
                                            <div className="py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                                        ) : templates && templates.length > 0 ? (
                                            <div className="divide-y border-b">
                                                {templates.map(t => (
                                                    <Link 
                                                        key={t.id} 
                                                        href={`/modules/${t.moduleId}/templates/${t.id}`}
                                                        className="flex items-center justify-between px-8 py-6 hover:bg-slate-50 transition-colors group"
                                                    >
                                                        <div className="flex items-center gap-6">
                                                            <div className="h-12 w-12 rounded-2xl bg-white border-2 flex items-center justify-center text-primary shadow-sm group-hover:scale-110 transition-transform">
                                                                <FileSpreadsheet className="h-6 w-6" />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline" className="h-4 text-[7px] font-black uppercase tracking-widest border-primary/20 text-primary">{t.type}</Badge>
                                                                    <p className="font-black uppercase text-sm text-slate-900">{t.name}</p>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Linked to Module: {allModules?.find((m:any) => m.id === t.moduleId)?.name || t.moduleId}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">Launch Designer</Button>
                                                            <ChevronRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-20 text-center flex flex-col items-center justify-center gap-4 text-muted-foreground opacity-20">
                                                <FileSpreadsheet className="h-16 w-16" />
                                                <p className="font-black uppercase tracking-[0.2em] text-sm">No Blueprints Synchronized</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="margins">
                                <Card>
                                    <CardHeader><CardTitle>Margins & Tax</CardTitle></CardHeader>
                                    <CardContent>
                                        <p>Margin management interface coming soon.</p>
                                    </CardContent>
                                </Card>
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
                                                <Building className="h-12 w-12" />
                                                <p className="font-black uppercase tracking-widest text-xs">Sub Dealer Directory Synchronized</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            )}
                        </Tabs>
                    </div>
                </FormProvider>
            ) : null}

            {organisation && (
                <CreateBlueprintDialog 
                    isOpen={isCreateBlueprintOpen} 
                    onOpenChange={setIsCreateBlueprintOpen} 
                    orgId={organisation.id} 
                    allModules={allModules || []} 
                />
            )}
        </>
    );
}
