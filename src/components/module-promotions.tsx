'use client';

import { useState, useMemo } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useStorage } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useCollection } from '@/firebase/firestore/use-collection';
import { uploadFileToStorage } from '@/firebase/storage';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Tag, Plus, Pencil, Trash2, Power, FileText, Loader2, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Promotion {
    id: string;
    name: string;
    description: string;
    type: 'fixed-amount' | 'per-hp' | 'percentage' | 'category-discount';
    status: 'active' | 'inactive';
    fixedAmount?: number;
    perHpAmount?: number;
    percentage?: number;
    appliesTo: 'motor' | 'rigging' | 'propeller' | 'all-accessories' | 'total';
    startDate?: any;
    endDate?: any;
    imageUrl?: string;
    pdfUrl?: string;
    showOnQuote: boolean;
    showImageOnQuote: boolean;
    showPdfOnQuote: boolean;
    createdByUserId: string;
    createdByUserName: string;
    createdAt: any;
    updatedAt: any;
    changeLog: { action: string; by: string; at: any; note?: string }[];
}

interface ModulePromotionsProps {
    moduleId: string;
    vendorId: string;
    organisationId: string;
}

const PROMO_TYPES: { value: Promotion['type']; label: string }[] = [
    { value: 'fixed-amount', label: 'Fixed Amount' },
    { value: 'per-hp', label: 'Per-HP' },
    { value: 'percentage', label: 'Percentage' },
    { value: 'category-discount', label: 'Category Discount' },
];

const APPLIES_TO_OPTIONS: { value: Promotion['appliesTo']; label: string }[] = [
    { value: 'motor', label: 'Motor' },
    { value: 'rigging', label: 'Rigging' },
    { value: 'propeller', label: 'Propeller' },
    { value: 'all-accessories', label: 'All Accessories' },
    { value: 'total', label: 'Total' },
];

function getAmountLabel(type: Promotion['type']): string {
    switch (type) {
        case 'fixed-amount': return '$';
        case 'per-hp': return '$/HP';
        case 'percentage': return '%';
        case 'category-discount': return '%';
        default: return '$';
    }
}

function getAmountDisplay(promo: Promotion): string {
    switch (promo.type) {
        case 'fixed-amount': return `$${promo.fixedAmount ?? 0}`;
        case 'per-hp': return `$${promo.perHpAmount ?? 0}/HP`;
        case 'percentage': return `${promo.percentage ?? 0}%`;
        case 'category-discount': return `${promo.percentage ?? 0}%`;
        default: return '';
    }
}

function getAmountValue(promo: Partial<Promotion>): number {
    switch (promo.type) {
        case 'fixed-amount': return promo.fixedAmount ?? 0;
        case 'per-hp': return promo.perHpAmount ?? 0;
        case 'percentage': return promo.percentage ?? 0;
        case 'category-discount': return promo.percentage ?? 0;
        default: return 0;
    }
}

function getTypeLabel(type: Promotion['type']): string {
    return PROMO_TYPES.find(t => t.value === type)?.label ?? type;
}

function getAppliesToLabel(appliesTo: Promotion['appliesTo']): string {
    return APPLIES_TO_OPTIONS.find(a => a.value === appliesTo)?.label ?? appliesTo;
}

export function ModulePromotions({ moduleId, vendorId, organisationId }: ModulePromotionsProps) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { user } = useUser();

    const [filter, setFilter] = useState<'active' | 'inactive'>('active');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formType, setFormType] = useState<Promotion['type']>('fixed-amount');
    const [formAmount, setFormAmount] = useState<number>(0);
    const [formAppliesTo, setFormAppliesTo] = useState<Promotion['appliesTo']>('motor');
    const [formStartDate, setFormStartDate] = useState('');
    const [formEndDate, setFormEndDate] = useState('');
    const [formShowOnQuote, setFormShowOnQuote] = useState(true);
    const [formShowImageOnQuote, setFormShowImageOnQuote] = useState(false);
    const [formShowPdfOnQuote, setFormShowPdfOnQuote] = useState(false);
    const [formImageUrl, setFormImageUrl] = useState('');
    const [formPdfUrl, setFormPdfUrl] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const promotionsRef = useMemoFirebase(
        () => collection(firestore, 'modules', moduleId, 'promotions'),
        [firestore, moduleId]
    );

    const { data: promotions, isLoading } = useCollection<Promotion>(promotionsRef);

    const filteredPromotions = useMemo(() => {
        if (!promotions) return [];
        return promotions.filter(p => p.status === filter);
    }, [promotions, filter]);

    const userName = user?.displayName || user?.email || 'Unknown';
    const userId = user?.uid || '';

    function resetForm() {
        setFormName('');
        setFormDescription('');
        setFormType('fixed-amount');
        setFormAmount(0);
        setFormAppliesTo('motor');
        setFormStartDate('');
        setFormEndDate('');
        setFormShowOnQuote(true);
        setFormShowImageOnQuote(false);
        setFormShowPdfOnQuote(false);
        setFormImageUrl('');
        setFormPdfUrl('');
        setImageFile(null);
        setPdfFile(null);
        setImagePreview(null);
        setEditingPromo(null);
    }

    function openCreateDialog() {
        resetForm();
        setDialogOpen(true);
    }

    function openEditDialog(promo: Promotion) {
        setEditingPromo(promo);
        setFormName(promo.name);
        setFormDescription(promo.description || '');
        setFormType(promo.type);
        setFormAmount(getAmountValue(promo));
        setFormAppliesTo(promo.appliesTo);
        setFormStartDate(promo.startDate ? promo.startDate : '');
        setFormEndDate(promo.endDate ? promo.endDate : '');
        setFormShowOnQuote(promo.showOnQuote ?? true);
        setFormShowImageOnQuote(promo.showImageOnQuote ?? false);
        setFormShowPdfOnQuote(promo.showPdfOnQuote ?? false);
        setFormImageUrl(promo.imageUrl || '');
        setFormPdfUrl(promo.pdfUrl || '');
        setImageFile(null);
        setPdfFile(null);
        setImagePreview(promo.imageUrl || null);
        setDialogOpen(true);
    }

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        const reader = new FileReader();
        reader.onload = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(file);
    }

    function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setPdfFile(file);
    }

    async function handleSave() {
        if (!formName.trim()) {
            toast({ title: 'Name is required', variant: 'destructive' });
            return;
        }

        setSaving(true);
        setUploading(true);

        try {
            let imageUrl = formImageUrl;
            let pdfUrl = formPdfUrl;

            const promoId = editingPromo?.id || `temp-${Date.now()}`;

            // Upload image if new file selected
            if (imageFile) {
                const imagePath = `modules/${moduleId}/promotions/${promoId}/image-${Date.now()}`;
                imageUrl = await uploadFileToStorage(storage, imageFile, imagePath);
            }

            // Upload PDF if new file selected
            if (pdfFile) {
                const pdfPath = `modules/${moduleId}/promotions/${promoId}/pdf-${Date.now()}`;
                pdfUrl = await uploadFileToStorage(storage, pdfFile, pdfPath);
            }

            setUploading(false);

            const promoData = {
                name: formName.trim(),
                description: formDescription.trim(),
                type: formType,
                fixedAmount: formType === 'fixed-amount' ? formAmount : null,
                perHpAmount: formType === 'per-hp' ? formAmount : null,
                percentage: (formType === 'percentage' || formType === 'category-discount') ? formAmount : null,
                appliesTo: formAppliesTo,
                startDate: formStartDate || null,
                endDate: formEndDate || null,
                imageUrl: imageUrl || null,
                pdfUrl: pdfUrl || null,
                showOnQuote: formShowOnQuote,
                showImageOnQuote: formShowImageOnQuote,
                showPdfOnQuote: formShowPdfOnQuote,
                updatedAt: serverTimestamp(),
            };

            if (editingPromo) {
                const promoRef = doc(firestore, 'modules', moduleId, 'promotions', editingPromo.id);
                await updateDoc(promoRef, {
                    ...promoData,
                    changeLog: arrayUnion({
                        action: 'edited',
                        by: userName,
                        at: new Date().toISOString(),
                    }),
                });
                toast({ title: 'Promotion updated' });
            } else {
                await addDoc(collection(firestore, 'modules', moduleId, 'promotions'), {
                    ...promoData,
                    status: 'active',
                    createdByUserId: userId,
                    createdByUserName: userName,
                    createdAt: serverTimestamp(),
                    changeLog: [{
                        action: 'created',
                        by: userName,
                        at: new Date().toISOString(),
                    }],
                });
                toast({ title: 'Promotion created' });
            }

            setDialogOpen(false);
            resetForm();
        } catch (err) {
            console.error('Failed to save promotion:', err);
            toast({ title: 'Failed to save promotion', variant: 'destructive' });
        } finally {
            setSaving(false);
            setUploading(false);
        }
    }

    async function handleToggleStatus(promo: Promotion) {
        const newStatus = promo.status === 'active' ? 'inactive' : 'active';
        const action = newStatus === 'active' ? 'activated' : 'deactivated';

        try {
            const promoRef = doc(firestore, 'modules', moduleId, 'promotions', promo.id);
            await updateDoc(promoRef, {
                status: newStatus,
                updatedAt: serverTimestamp(),
                changeLog: arrayUnion({
                    action,
                    by: userName,
                    at: new Date().toISOString(),
                }),
            });
            toast({ title: `Promotion ${action}` });
        } catch (err) {
            console.error('Failed to toggle promotion status:', err);
            toast({ title: 'Failed to update status', variant: 'destructive' });
        }
    }

    async function handleDelete(promoId: string) {
        try {
            const promoRef = doc(firestore, 'modules', moduleId, 'promotions', promoId);
            await deleteDoc(promoRef);
            setDeleteConfirmId(null);
            toast({ title: 'Promotion deleted' });
        } catch (err) {
            console.error('Failed to delete promotion:', err);
            toast({ title: 'Failed to delete promotion', variant: 'destructive' });
        }
    }

    return (
        <Card className="border-2 rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                        <Tag className="w-5 h-5" />
                        Promotions & Rebates
                    </CardTitle>
                    <CardDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Manage motor promotions and rebates
                    </CardDescription>
                </div>
                <Button
                    onClick={openCreateDialog}
                    className="rounded-xl text-[10px] font-black uppercase"
                    size="sm"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Add New
                </Button>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Filter tabs */}
                <div className="flex gap-2">
                    <Button
                        variant={filter === 'active' ? 'default' : 'outline'}
                        size="sm"
                        className="rounded-xl text-[10px] font-black uppercase"
                        onClick={() => setFilter('active')}
                    >
                        Active
                    </Button>
                    <Button
                        variant={filter === 'inactive' ? 'default' : 'outline'}
                        size="sm"
                        className="rounded-xl text-[10px] font-black uppercase"
                        onClick={() => setFilter('inactive')}
                    >
                        Inactive
                    </Button>
                </div>

                {/* Loading state */}
                {isLoading && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && filteredPromotions.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        No {filter} promotions found.
                    </div>
                )}

                {/* Promotion cards */}
                {filteredPromotions.map(promo => (
                    <div key={promo.id} className="border-2 rounded-2xl p-4 space-y-3">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-primary" />
                                <span className="font-black text-sm">{promo.name}</span>
                            </div>
                            <Badge
                                variant={promo.status === 'active' ? 'default' : 'secondary'}
                                className={`text-[9px] font-black uppercase ${
                                    promo.status === 'active'
                                        ? 'bg-green-100 text-green-800 border-green-300'
                                        : 'bg-gray-100 text-gray-600 border-gray-300'
                                }`}
                            >
                                {promo.status === 'active' ? '● Active' : '● Inactive'}
                            </Badge>
                        </div>

                        {promo.description && (
                            <p className="text-sm text-muted-foreground">{promo.description}</p>
                        )}

                        <div className="flex items-center gap-3">
                            <span className="text-lg font-black text-primary">
                                {getAmountDisplay(promo)}
                            </span>
                            <span className="text-muted-foreground text-sm">off</span>
                            <span className="text-sm">{getAppliesToLabel(promo.appliesTo)}</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[9px] font-black uppercase">
                                {getTypeLabel(promo.type)}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] font-black uppercase">
                                Applies to: {getAppliesToLabel(promo.appliesTo)}
                            </Badge>
                        </div>

                        {/* Quote toggles */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {promo.showOnQuote && (
                                <Badge variant="outline" className="text-[9px] font-black uppercase bg-blue-50 text-blue-700 border-blue-200">
                                    <Check className="w-3 h-3 mr-0.5" /> Quote
                                </Badge>
                            )}
                            {promo.showImageOnQuote && promo.imageUrl && (
                                <Badge variant="outline" className="text-[9px] font-black uppercase bg-blue-50 text-blue-700 border-blue-200">
                                    <Check className="w-3 h-3 mr-0.5" /> Image
                                </Badge>
                            )}
                            {promo.showPdfOnQuote && promo.pdfUrl && (
                                <Badge variant="outline" className="text-[9px] font-black uppercase bg-blue-50 text-blue-700 border-blue-200">
                                    <Check className="w-3 h-3 mr-0.5" /> PDF
                                </Badge>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl text-[10px] font-black uppercase"
                                onClick={() => openEditDialog(promo)}
                            >
                                <Pencil className="w-3 h-3 mr-1" />
                                Edit
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl text-[10px] font-black uppercase"
                                onClick={() => handleToggleStatus(promo)}
                            >
                                <Power className="w-3 h-3 mr-1" />
                                {promo.status === 'active' ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl text-[10px] font-black uppercase text-destructive hover:text-destructive"
                                onClick={() => setDeleteConfirmId(promo.id)}
                            >
                                <Trash2 className="w-3 h-3 mr-1" />
                                Delete
                            </Button>
                        </div>
                    </div>
                ))}
            </CardContent>

            {/* Delete confirmation dialog */}
            <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-md">
                    <DialogHeader className="p-6 bg-muted/5 border-b">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">
                            Confirm Delete
                        </DialogTitle>
                    </DialogHeader>
                    <div className="p-6">
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to delete this promotion? This action cannot be undone.
                        </p>
                    </div>
                    <div className="p-6 border-t bg-muted/5 flex justify-end gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" className="rounded-xl text-[10px] font-black uppercase">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            variant="destructive"
                            className="rounded-xl text-[10px] font-black uppercase"
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                        >
                            Delete
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create/Edit dialog */}
            <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-2xl max-h-[85vh] flex flex-col">
                    <DialogHeader className="p-6 bg-muted/5 border-b">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">
                            {editingPromo ? 'Edit Promotion' : 'Create Promotion'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                        {/* Name */}
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Name
                            </Label>
                            <Input
                                className="rounded-xl border-2"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="e.g. Winter Rigging Rebate 2026"
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Description
                            </Label>
                            <Textarea
                                className="rounded-xl border-2"
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="Describe this promotion..."
                                rows={3}
                            />
                        </div>

                        {/* Type */}
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Type
                            </Label>
                            <Select value={formType} onValueChange={(v) => setFormType(v as Promotion['type'])}>
                                <SelectTrigger className="rounded-xl border-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROMO_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Amount */}
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Amount ({getAmountLabel(formType)})
                            </Label>
                            <Input
                                className="rounded-xl border-2"
                                type="number"
                                min={0}
                                value={formAmount}
                                onChange={(e) => setFormAmount(parseFloat(e.target.value) || 0)}
                            />
                        </div>

                        {/* Applies To */}
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Applies To
                            </Label>
                            <Select value={formAppliesTo} onValueChange={(v) => setFormAppliesTo(v as Promotion['appliesTo'])}>
                                <SelectTrigger className="rounded-xl border-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {APPLIES_TO_OPTIONS.map(a => (
                                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Date range */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    Start Date (optional)
                                </Label>
                                <Input
                                    className="rounded-xl border-2"
                                    type="date"
                                    value={formStartDate}
                                    onChange={(e) => setFormStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    End Date (optional)
                                </Label>
                                <Input
                                    className="rounded-xl border-2"
                                    type="date"
                                    value={formEndDate}
                                    onChange={(e) => setFormEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Image upload */}
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Promotion Image
                            </Label>
                            <Input
                                className="rounded-xl border-2"
                                type="file"
                                accept="image/*"
                                onChange={handleImageSelect}
                            />
                            {imagePreview && (
                                <img
                                    src={imagePreview}
                                    alt="Promotion preview"
                                    className="w-full h-32 object-contain rounded-xl border-2 bg-slate-50"
                                />
                            )}
                        </div>

                        {/* PDF upload */}
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Promotion PDF
                            </Label>
                            <Input
                                className="rounded-xl border-2"
                                type="file"
                                accept=".pdf"
                                onChange={handlePdfSelect}
                            />
                            {(pdfFile || formPdfUrl) && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <FileText className="w-4 h-4" />
                                    <span>{pdfFile?.name || 'Attached PDF'}</span>
                                    {formPdfUrl && !pdfFile && (
                                        <a
                                            href={formPdfUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary underline text-xs"
                                        >
                                            Download
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Quote display toggles */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Quote Display Options
                            </Label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formShowOnQuote}
                                    onChange={(e) => setFormShowOnQuote(e.target.checked)}
                                    className="rounded border-2"
                                />
                                Show on Quote
                            </label>
                            {(imagePreview || formImageUrl) && (
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formShowImageOnQuote}
                                        onChange={(e) => setFormShowImageOnQuote(e.target.checked)}
                                        className="rounded border-2"
                                    />
                                    Show Image on Quote
                                </label>
                            )}
                            {(pdfFile || formPdfUrl) && (
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formShowPdfOnQuote}
                                        onChange={(e) => setFormShowPdfOnQuote(e.target.checked)}
                                        className="rounded border-2"
                                    />
                                    Attach PDF to Quote
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="p-6 border-t bg-muted/5 shrink-0 flex justify-end gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" className="rounded-xl text-[10px] font-black uppercase">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            className="rounded-xl text-[10px] font-black uppercase"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    {uploading ? 'Uploading...' : 'Saving...'}
                                </>
                            ) : (
                                editingPromo ? 'Save Changes' : 'Create Promotion'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
