'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, doc, deleteDoc, addDoc, writeBatch, updateDoc, getDoc, serverTimestamp, orderBy, setDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LayoutGrid, List, Sailboat, Trash2, PlusCircle, ArrowUp, ArrowDown, Pencil, Copy, ChevronRight, ChevronDown, Hash, ShieldCheck, Tag, Anchor, Image as ImageIcon, CheckCircle2, DollarSign, PackagePlus, Ship, X, Settings2, Plus } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSlug, cn } from '@/lib/utils';
import Link from 'next/link';
import { useUser } from '@/firebase/auth/use-user';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { uploadFileToStorage } from '@/firebase/storage';
import { useStorage } from '@/firebase/provider';

interface Variant {
    id: string;
    sku: string;
    name: string;
    colorName?: string;
    colorCode?: string;
    material?: string;
    cost?: number;
    sellPriceExclGst?: number;
    imageUrl?: string;
    order?: number;
}

interface ModelGroup {
    id: string;
    name: string;
    modelCode: string;
    slug?: string;
    coverImageUrl?: string;
    order?: number;
}

interface Range {
    id: string;
    name: string;
    slug?: string;
    vendorId: string;
}

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}

function HighfieldVariantList({ 
    vendorId, 
    rangeId, 
    groupId, 
    isAdmin,
    onEditVariant
}: { 
    vendorId: string, 
    rangeId: string, 
    groupId: string, 
    isAdmin: boolean,
    onEditVariant: (v: Variant) => void
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${groupId}/variants`), orderBy('order')),
    [firestore, vendorId, rangeId, groupId]);
    
    const { data: variants, loading } = useCollection<Variant>(variantsQuery);

    const handleDeleteVariant = async (variantId: string) => {
        try {
            await deleteDoc(doc(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${groupId}/variants`, variantId));
            toast({ title: "Variant deleted" });
        } catch (error) {
            toast({ variant: 'destructive', title: "Delete failed" });
        }
    };

    if (loading) return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>;

    if (!variants || variants.length === 0) {
        return <div className="py-4 text-center text-[10px] uppercase font-black text-muted-foreground/40 italic">No variants defined for this range.</div>;
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pt-2">
            {variants.map((variant) => (
                <Card key={variant.id} className="group relative overflow-hidden bg-background border-muted shadow-none hover:border-primary/40 transition-all">
                    <div className="flex gap-3 p-3">
                        <div className="relative h-16 w-16 bg-muted rounded border overflow-hidden shrink-0">
                            {variant.imageUrl ? (
                                <Image src={variant.imageUrl} alt={variant.sku} fill className="object-cover" sizes="64px" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Sailboat className="h-6 w-6 text-muted-foreground/30" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <p className="font-black text-[11px] uppercase truncate leading-none">{variant.name}</p>
                            <p className="font-mono text-[10px] text-primary font-bold mt-1.5 uppercase truncate">{variant.sku}</p>
                            <div className="flex items-center gap-1.5 mt-2">
                                {variant.material && <Badge variant="secondary" className="text-[8px] h-4 px-1.5 font-black uppercase">{variant.material}</Badge>}
                                {variant.colorName && (
                                    <Badge variant="outline" className="text-[8px] h-4 px-1.5 font-black uppercase">
                                        {variant.colorName} {variant.colorCode && `(${variant.colorCode})`}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                    {isAdmin && (
                        <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEditVariant(variant)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteVariant(variant.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                    )}
                </Card>
            ))}
        </div>
    );
}

function HighfieldGroupedView({ 
    models, 
    vendor, 
    range, 
    isAdmin,
    onEditGroup,
    onAddVariant,
    onEditVariant
}: { 
    models: ModelGroup[], 
    vendor: Vendor, 
    range: Range, 
    isAdmin: boolean,
    onEditGroup: (m: ModelGroup) => void,
    onAddVariant: (m: ModelGroup) => void,
    onEditVariant: (v: Variant, group: ModelGroup) => void
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const handleDeleteGroup = async (groupId: string) => {
        try {
            await deleteDoc(doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, groupId));
            toast({ title: "Model Range Deleted" });
        } catch (error) {
            toast({ variant: 'destructive', title: "Delete Failed" });
        }
    };

    return (
        <div className="space-y-6">
            {models.map((group) => (
                <Collapsible key={group.id} defaultOpen className="space-y-4">
                    <Card className="overflow-hidden border-l-4 border-l-primary shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center p-4 gap-4 bg-muted/10">
                            <div className="relative h-20 w-32 bg-secondary rounded border overflow-hidden shrink-0">
                                {group.coverImageUrl ? (
                                    <Image src={group.coverImageUrl} alt={group.name} fill className="object-contain p-2" sizes="128px" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                        <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-black text-xl uppercase tracking-tight text-primary">{group.modelCode}</h3>
                                    <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest">{group.name}</Badge>
                                </div>
                                <p className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest mt-1">Manage shared logic and variants for this model code.</p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <Button asChild variant="outline" size="sm" className="font-bold">
                                    <Link href={`/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}/models/${group.id}`}>
                                        <Settings2 className="mr-2 h-4 w-4" />
                                        Shared Config
                                    </Link>
                                </Button>
                                <Button onClick={() => onAddVariant(group)} size="sm" className="font-bold bg-primary hover:bg-primary/90">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Add SKU
                                </Button>
                                {isAdmin && (
                                    <div className="flex items-center ml-2 border-l pl-4 gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditGroup(group)}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteGroup(group.id)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                )}
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 group-data-[state=open]:bg-muted">
                                        <ChevronDown className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                    </Button>
                                </CollapsibleTrigger>
                            </div>
                        </div>
                        <CollapsibleContent>
                            <div className="p-4 pt-0 border-t bg-muted/5">
                                <HighfieldVariantList 
                                    vendorId={vendor.id} 
                                    rangeId={range.id} 
                                    groupId={group.id} 
                                    isAdmin={isAdmin} 
                                    onEditVariant={(v) => onEditVariant(v, group)}
                                />
                            </div>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            ))}
        </div>
    );
}

export default function RangeDetailsPage() {
    const params = useParams();
    const vendorSlugOrId = params?.id as string | undefined;
    const rangeSlugOrId = params?.rangeId as string | undefined;
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();
    
    // Group Add/Edit State
    const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<ModelGroup | null>(null);
    const [groupName, setGroupName] = useState('');
    const [groupCode, setGroupCode] = useState('');
    const [groupImage, setGroupImage] = useState<File | null>(null);
    const [groupImagePreview, setGroupImagePreview] = useState<string | null>(null);
    const [isSavingGroup, setIsSavingGroup] = useState(false);

    // Variant Add State
    const [isVariantDialogOpen, setIsVariantDialogOpen] = useState(false);
    const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
    const [targetGroup, setTargetGroup] = useState<ModelGroup | null>(null);
    
    const [varName, setVarName] = useState('');
    const [varSku, setVarSku] = useState('');
    const [varColor, setVarColor] = useState('');
    const [varColorCode, setVarColorCode] = useState('');
    const [varMaterial, setVarMaterial] = useState<'PVC' | 'HYP' | ''>('');
    
    const [varCostExcl, setVarCostExcl] = useState('');
    const [varCostIncl, setVarCostIncl] = useState('');
    const [varPriceExcl, setVarPriceExcl] = useState('');
    const [varPriceIncl, setVarPriceIncl] = useState('');
    
    const [varImage, setVarImage] = useState<File | null>(null);
    const [varImagePreview, setVarImagePreview] = useState<string | null>(null);
    const [isSavingVariant, setIsSavingVariant] = useState(false);

    const { user, loading: userLoading } = useUser();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole?: string }>(userProfileRef);
    const isAdmin = !!userProfile && userProfile.appRole === 'HelmLogic Admin';

    // Fetch Vendor/Range
    const vendorQuery = useMemoFirebase(() => 
        vendorSlugOrId ? query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId)) : null,
    [firestore, vendorSlugOrId]);
    const { data: vendorsBySlug } = useCollection<Vendor>(vendorQuery);
    const vendor = useMemo(() => vendorsBySlug?.[0] || { id: vendorSlugOrId } as Vendor, [vendorsBySlug, vendorSlugOrId]);

    const rangeQuery = useMemoFirebase(() => 
        vendor?.id && rangeSlugOrId ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId)) : null,
    [firestore, vendor, rangeSlugOrId]);
    const { data: rangesBySlug } = useCollection<Range>(rangeQuery);
    const range = useMemo(() => rangesBySlug?.[0] || { id: rangeSlugOrId } as Range, [rangesBySlug, rangeSlugOrId]);

    const groupsQuery = useMemoFirebase(() => 
        vendor?.id && range?.id ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order')) : null,
    [firestore, vendor, range]);
    const { data: modelGroups, loading: groupsLoading } = useCollection<ModelGroup>(groupsQuery);

    const handleSaveGroup = async () => {
        if (!groupName.trim() || !groupCode.trim() || !vendor.id || !range.id) return;
        setIsSavingGroup(true);
        try {
            const groupsCol = collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`);
            const groupRef = editingGroup ? doc(groupsCol, editingGroup.id) : doc(groupsCol);
            
            const data: any = {
                name: groupName,
                modelCode: groupCode.toUpperCase(),
                slug: createSlug(groupName),
                updatedAt: serverTimestamp(),
            };

            if (!editingGroup) {
                data.order = modelGroups?.length || 0;
                data.createdAt = serverTimestamp();
            }

            if (groupImage && storage) {
                const path = `highfield/groups/${groupRef.id}/cover-${Date.now()}`;
                data.coverImageUrl = await uploadFileToStorage(storage, groupImage, path);
            }

            await setDoc(groupRef, data, { merge: true });
            toast({ title: editingGroup ? "Group Updated" : "Group Created" });
            setIsGroupDialogOpen(false);
            resetGroupForm();
        } catch (error) {
            toast({ variant: 'destructive', title: "Save failed" });
        } finally {
            setIsSavingGroup(false);
        }
    };

    const handleSaveVariant = async () => {
        if (!targetGroup || !varSku.trim() || !vendor.id || !range.id) return;
        setIsSavingVariant(true);
        try {
            const variantsCol = collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models/${targetGroup.id}/variants`);
            const varRef = editingVariant ? doc(variantsCol, editingVariant.id) : doc(variantsCol);
            
            const data: any = {
                name: varName || `${varColor} ${varMaterial}`,
                sku: varSku.toUpperCase(),
                colorName: varColor,
                colorCode: varColorCode.toUpperCase(),
                material: varMaterial,
                cost: parseFloat(varCostExcl) || 0,
                sellPriceExclGst: parseFloat(varPriceExcl) || 0,
                updatedAt: serverTimestamp(),
            };

            if (!editingVariant) {
                data.createdAt = serverTimestamp();
                data.order = Date.now();
            }

            if (varImage && storage) {
                const path = `highfield/variants/${varRef.id}/photo-${Date.now()}`;
                data.imageUrl = await uploadFileToStorage(storage, varImage, path);
            }

            await setDoc(varRef, data, { merge: true });
            toast({ title: editingVariant ? "SKU Updated" : "SKU Created" });
            setIsVariantDialogOpen(false);
            resetVariantForm();
        } catch (error) {
            toast({ variant: 'destructive', title: "Add failed" });
        } finally {
            setIsSavingVariant(false);
        }
    };

    const resetGroupForm = () => {
        setEditingGroup(null);
        setGroupName('');
        setGroupCode('');
        setGroupImage(null);
        setGroupImagePreview(null);
    };

    const resetVariantForm = () => {
        setEditingVariant(null);
        setTargetGroup(null);
        setVarName('');
        setVarSku('');
        setVarColor('');
        setVarColorCode('');
        setVarMaterial('');
        setVarCostExcl('');
        setVarCostIncl('');
        setVarPriceExcl('');
        setVarPriceIncl('');
        setVarImage(null);
        setVarImagePreview(null);
    };

    const openEditGroup = (group: ModelGroup) => {
        setEditingGroup(group);
        setGroupName(group.name);
        setGroupCode(group.modelCode);
        setGroupImagePreview(group.coverImageUrl || null);
        setIsGroupDialogOpen(true);
    };

    const openEditVariant = (v: Variant, group: ModelGroup) => {
        setTargetGroup(group);
        setEditingVariant(v);
        setVarName(v.name);
        setVarSku(v.sku);
        setVarColor(v.colorName || '');
        setVarColorCode(v.colorCode || '');
        setVarMaterial(v.material as any || '');
        
        const cost = v.cost || 0;
        setVarCostExcl(cost.toFixed(2));
        setVarCostIncl((cost * 1.1).toFixed(2));
        
        const price = v.sellPriceExclGst || 0;
        setVarPriceExcl(price.toFixed(2));
        setVarPriceIncl((price * 1.1).toFixed(2));
        
        setVarImagePreview(v.imageUrl || null);
        setIsVariantDialogOpen(true);
    };

    // GST Calculation Helpers
    const updateCostFromExcl = (val: string) => {
        setVarCostExcl(val);
        const num = parseFloat(val);
        if (!isNaN(num)) setVarCostIncl((num * 1.1).toFixed(2));
        else setVarCostIncl('');
    };
    const updateCostFromIncl = (val: string) => {
        setVarCostIncl(val);
        const num = parseFloat(val);
        if (!isNaN(num)) setVarCostExcl((num / 1.1).toFixed(2));
        else setVarCostExcl('');
    };
    const updatePriceFromExcl = (val: string) => {
        setVarPriceExcl(val);
        const num = parseFloat(val);
        if (!isNaN(num)) setVarPriceIncl((num * 1.1).toFixed(2));
        else setVarPriceIncl('');
    };
    const updatePriceFromIncl = (val: string) => {
        setVarPriceIncl(val);
        const num = parseFloat(val);
        if (!isNaN(num)) setVarPriceExcl((num / 1.1).toFixed(2));
        else setVarPriceExcl('');
    };

    const loading = groupsLoading || userLoading || profileLoading;

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">Product Range: {range?.name}</h1>
                            <BreadcrumbNav />
                            <CardDescription>Manage Model Ranges (Codes) and their specific boat SKUs.</CardDescription>
                        </div>
                        {isAdmin && (
                            <Button onClick={() => setIsGroupDialogOpen(true)}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add Model Range
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {modelGroups && modelGroups.length > 0 ? (
                        <HighfieldGroupedView 
                            models={modelGroups} 
                            vendor={vendor} 
                            range={range} 
                            isAdmin={isAdmin} 
                            onEditGroup={openEditGroup}
                            onAddVariant={(g) => { setTargetGroup(g); setIsVariantDialogOpen(true); }}
                            onEditVariant={openEditVariant}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-60 border-2 border-dashed rounded-lg bg-muted/5">
                            <Sailboat className="h-16 w-16 text-muted-foreground/20" />
                            <h3 className="mt-4 text-lg font-semibold">No Model Ranges Yet</h3>
                            <p className="mt-2 text-sm text-muted-foreground">Start by defining a Model Range (Code) for this range.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Group Dialog */}
            <Dialog open={isGroupDialogOpen} onOpenChange={(open) => !open && (setIsGroupDialogOpen(false), resetGroupForm())}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingGroup ? 'Edit Model Range' : 'Add Model Range'}</DialogTitle>
                        <DialogDescription>Define the global identity for a series of boat variants.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="flex justify-center">
                            <div className="relative h-32 w-48 bg-muted rounded-lg border-2 border-dashed overflow-hidden group">
                                {groupImagePreview ? (
                                    <>
                                        <Image src={groupImagePreview} alt="Preview" fill className="object-contain p-2" />
                                        <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setGroupImage(null); setGroupImagePreview(null); }}><X className="h-3 w-3" /></Button>
                                    </>
                                ) : (
                                    <label className="flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-secondary transition-colors">
                                        <ImageIcon className="h-8 w-8 text-muted-foreground/40 mb-2" />
                                        <span className="text-[10px] font-black uppercase text-muted-foreground">Main Render</span>
                                        <Input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) { setGroupImage(file); setGroupImagePreview(URL.createObjectURL(file)); }
                                        }} />
                                    </label>
                                )}
                            </div>
                        </div>
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Range Series Name</Label>
                                <Input placeholder="e.g. Classic 310" value={groupName} onChange={e => setGroupName(e.target.value)} className="font-bold" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Model Code</Label>
                                <Input placeholder="e.g. CL310" value={groupCode} onChange={e => setGroupCode(e.target.value)} className="font-mono font-bold uppercase" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleSaveGroup} disabled={isSavingGroup || !groupName || !groupCode}>
                            {isSavingGroup && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingGroup ? 'Update Range' : 'Create Range'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Variant Dialog */}
            <Dialog open={isVariantDialogOpen} onOpenChange={(open) => !open && (setIsVariantDialogOpen(false), resetVariantForm())}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingVariant ? 'Edit SKU' : 'Add SKU'} to {targetGroup?.modelCode}</DialogTitle>
                        <DialogDescription>Define a specific color and material combination.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="flex justify-center">
                            <div className="relative h-28 w-44 bg-muted rounded border-2 border-dashed overflow-hidden group">
                                {varImagePreview ? (
                                    <>
                                        <Image src={varImagePreview} alt="Variant" fill className="object-contain p-2" />
                                        <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setVarImage(null); setVarImagePreview(null); }}><X className="h-3 w-3" /></Button>
                                    </>
                                ) : (
                                    <label className="flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-secondary">
                                        <Plus className="h-5 w-5 text-muted-foreground/40" />
                                        <span className="text-[8px] font-black uppercase text-muted-foreground">SKU Photo</span>
                                        <Input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) { setVarImage(file); setVarImagePreview(URL.createObjectURL(file)); }
                                        }} />
                                    </label>
                                )}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Variant Display Name</Label>
                                <Input placeholder="e.g. White PVC" value={varName} onChange={e => setVarName(e.target.value)} className="font-bold" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">SKU / Part ID</Label>
                                <Input placeholder="HF-CL310-PVC-WH" value={varSku} onChange={e => setVarSku(e.target.value)} className="font-mono uppercase font-bold" />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Material</Label>
                                <Select value={varMaterial} onValueChange={(v: any) => setVarMaterial(v)}>
                                    <SelectTrigger className="font-bold"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PVC">PVC</SelectItem>
                                        <SelectItem value="HYP">Hypalon (HYP)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Color Name</Label>
                                <Input placeholder="White" value={varColor} onChange={e => setVarColor(e.target.value)} className="font-bold" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Color Code</Label>
                                <Input placeholder="WH" value={varColorCode} onChange={e => setVarColorCode(e.target.value)} className="font-mono font-bold uppercase" />
                            </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Factory Cost</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase">Excl. GST</Label>
                                        <Input type="number" placeholder="0.00" value={varCostExcl} onChange={e => updateCostFromExcl(e.target.value)} className="h-9 text-xs font-bold" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase">Incl. GST</Label>
                                        <Input type="number" placeholder="0.00" value={varCostIncl} onChange={e => updateCostFromIncl(e.target.value)} className="h-9 text-xs font-bold bg-muted/30" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Retail Price</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase">Excl. GST</Label>
                                        <Input type="number" placeholder="0.00" value={varPriceExcl} onChange={e => updatePriceFromExcl(e.target.value)} className="h-9 text-xs font-bold" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[9px] font-bold text-muted-foreground/50 uppercase">Incl. GST</Label>
                                        <Input type="number" placeholder="0.00" value={varPriceIncl} onChange={e => updatePriceFromIncl(e.target.value)} className="h-9 text-xs font-bold bg-muted/30" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="pt-4 border-t">
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleSaveVariant} disabled={isSavingVariant || !varSku || !varMaterial}>
                            {isSavingVariant && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingVariant ? 'Update SKU' : 'Create SKU'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
