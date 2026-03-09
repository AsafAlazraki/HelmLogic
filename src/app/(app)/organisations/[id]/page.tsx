'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';

import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useStorage } from '@/firebase';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, query, where, doc, updateDoc, deleteDoc, orderBy, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2, Save, X, Mail, Building, Check, PlusCircle, Settings2, Percent, TrendingUp, Hash, FileSpreadsheet, ChevronRight, Waves, Zap, ScrollText } from 'lucide-react';
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
import { SUPPORTED_CURRENCIES } from '@/lib/currency-utils';
import { Badge } from '@/components/ui/badge';
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
  slug: z.string().nullable().optional(),
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
  gstPercentage: z.coerce.number().min(0).max(100).default(10),
  brandMargins: z.record(z.string(), z.coerce.number()).optional(),
  moduleMargins: z.record(z.string(), z.coerce.number()).optional(),
  dataWarehouseSubscriptions: z.array(z.string()).optional(),
  enabledModuleSubscriptions: z.array(z.string()).optional(),
  moduleAssociatedVendorAccess: z.record(z.string(), z.array(z.string())).optional(),
  dealerFitCategories: z.array(z.string()).optional(),
  parentOrganisationId: z.string().nullable().optional(),
});

type OrganisationFormData = z.infer<typeof formSchema>;

function CreateTemplateDialog({ isOpen, onOpenChange, orgId, allModules }: { isOpen: boolean, onOpenChange: (open: boolean) => void, orgId: string, allModules: any[] }) {
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
                                <SelectItem value="Contract" className="text-[10px] font-bold uppercase py-2.5">Sales Contract</SelectItem>
                                <SelectItem value="Invoice" className="text-[10px] font-bold uppercase py-2.5">Invoice</SelectItem>
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

export default function OrganisationDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
    const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
    const slugOrId = params.id as string;
    const firestore = useFirestore();
    const storage = useStorage();

    const [activeVendorConfigModule, setActiveVendorConfigModule] = useState<any | null>(null);
    const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);

    const orgQueryBySlug = useMemoFirebase(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'organisations'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);

    const { data: organisationsBySlug, loading: slugLoading } = useCollection<OrganisationFormData>(orgQueryBySlug);
    
    const organisationByIdRef = useMemoFirebase(() => {
        if (!slugOrId) return null;
        return doc(firestore, 'organisations', slugOrId);
    }, [firestore, slugOrId]);
    
    const { data: organisationById, loading: idLoading } = useDoc<OrganisationFormData>(organisationByIdRef);

    const organisation = useMemo(() => organisationsBySlug?.[0] || organisationById, [organisationsBySlug, organisationById]);
    const orgLoading = slugLoading || idLoading;

    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const modulesQuery = useMemoFirebase(() => collection(firestore, 'modules'), [firestore]);
    const categoriesQuery = useMemoFirebase(() => collection(firestore, 'dealerFitCategories'), [firestore]);

    const { data: allVendors, loading: vendorsLoading } = useCollection<any>(vendorsQuery);
    const { data: allModules, loading: modulesLoading } = useCollection<any>(modulesQuery);
    const { data: allDealerFitCategories, loading: catsLoading } = useCollection<any>(categoriesQuery);

    const templatesQuery = useMemoFirebase(() => {
        if (!organisation?.id) return null;
        return query(collection(firestore, `organisations/${organisation.id}/templates`), orderBy('createdAt', 'desc'));
    }, [firestore, organisation?.id]);
    const { data: templates } = useCollection<any>(templatesQuery);

    const form = useForm<OrganisationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            shortCode: '',
            permissions: {},
            roles: [],
            dataWarehouseSubscriptions: [],
            enabledModuleSubscriptions: [],
            dealerFitCategories: [],
            gstPercentage: 10,
            brandMargins: {},
            moduleMargins: {},
        },
    });

    const watchedRoles = form.watch('roles');
    const watchedSubDealersEnabled = form.watch('subDealersEnabled');
    const watchedBrandSubscriptions = form.watch('dataWarehouseSubscriptions') || [];
    const watchedModuleSubscriptions = form.watch('enabledModuleSubscriptions') || [];

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
                gstPercentage: organisation.gstPercentage ?? 10,
                brandMargins: organisation.brandMargins || {},
                moduleMargins: organisation.moduleMargins || {},
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

    async function onSubmit(values: OrganisationFormData) {
        if (!organisation) return;
        setIsSubmitting(true);
        
        try {
            const orgDocRef = doc(firestore, 'organisations', organisation.id);

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
                subDealersEnabled: values.subDealersEnabled || false,
                gstPercentage: values.gstPercentage,
                brandMargins: values.brandMargins || {},
                moduleMargins: values.moduleMargins || {},
                dataWarehouseSubscriptions: values.dataWarehouseSubscriptions || [],
                enabledModuleSubscriptions: values.enabledModuleSubscriptions || [],
                moduleAssociatedVendorAccess: values.moduleAssociatedVendorAccess || {},
                dealerFitCategories: values.dealerFitCategories || [],
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

    if (orgLoading) return <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;

    return (
        <AdminGuard>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">Edit {organisation?.name}</h1>
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
                        <TabsList className={cn("grid w-full", watchedSubDealersEnabled ? 'grid-cols-6' : 'grid-cols-5')}>
                            <TabsTrigger value="details">Details</TabsTrigger>
                            <TabsTrigger value="access">Access</TabsTrigger>
                            <TabsTrigger value="margins">Margins</TabsTrigger>
                            <TabsTrigger value="blueprints">Blueprints</TabsTrigger>
                            {watchedSubDealersEnabled && <TabsTrigger value="sub-dealers">Sub Dealers</TabsTrigger>}
                        </TabsList>
                        
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
                                        onClick={() => setIsCreateTemplateOpen(true)}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Initialize New Template
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {templates && templates.length > 0 ? (
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
                        
                        {/* Other tabs content... */}
                    </Tabs>
                </form>
            </Form>

            {organisation && (
                <CreateTemplateDialog 
                    isOpen={isCreateTemplateOpen} 
                    onOpenChange={setIsCreateTemplateOpen} 
                    orgId={organisation.id} 
                    allModules={allModules || []} 
                />
            )}
        </AdminGuard>
    );
}
