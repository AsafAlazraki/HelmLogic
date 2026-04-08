'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useStorage, useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { doc, setDoc, updateDoc, serverTimestamp, collection as firestoreCollection } from 'firebase/firestore';
import { pdf } from '@react-pdf/renderer';
import { uploadFileToStorage } from '@/firebase/storage';
import { ProposalPDFDocument } from '@/components/proposal-pdf';
import { buildQuoteFinancials } from '@/lib/quote-financials';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    Loader2,
    User,
    Box,
    CheckCircle2,
    Mail,
    Phone,
    Building,
    MapPin,
    Anchor,
    DollarSign,
} from 'lucide-react';

interface FinalizeQuoteDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    quoteData: {
        model: any;
        vendor: any;
        range: any;
        module: any;
        rangeId: string;
        activeVariant: any;
        selectedOptionsData: any[];
        customOptions: any[];
        selectedMotor: any;
        selectedMotorAccessories: any[];
        selectedTrailerOptionsData: any[];
        selectedDealerFitData: any[];
        totalPrice: number;
        isRegoSelected: boolean;
        isStickerSelected: boolean;
        isTenderToSelected: boolean;
        isTrailerRegoSelected: boolean;
        selectedTrailerId: string | null;
        priceLevelUsed?: string;
        appliedPromotions?: any[];
        dealerServices?: { extendedWarranty: boolean; servicePlan: boolean };
    };
    organisationId: string | null;
    userProfile: any;
    canSaveAsStock?: boolean;
    locations?: string[];
    onStockCreated?: () => void;
}

type FinalizeMode = 'customer' | 'stock';

export function FinalizeQuoteDialog({ isOpen, onOpenChange, quoteData, organisationId, userProfile, canSaveAsStock = true, locations = [], onStockCreated }: FinalizeQuoteDialogProps) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { user } = useUser();
    const router = useRouter();
    const { toast } = useToast();

    const orgRef = useMemoFirebase(() =>
        organisationId ? doc(firestore, 'organisations', organisationId) : null,
    [firestore, organisationId]);
    const { data: organisation } = useDoc<any>(orgRef);
    const orgCode = (organisation?.shortCode || 'HL').toUpperCase();

    const [mode, setMode] = useState<FinalizeMode>('customer');
    const [isSaving, setIsSaving] = useState(false);

    // Customer fields
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerCompany, setCustomerCompany] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');

    // Stock fields
    const [stockNumber, setStockNumber] = useState('');
    const [stockLocation, setStockLocation] = useState('');
    const [stockStatus, setStockStatus] = useState('In Stock');
    const [stockCustomerId, setStockCustomerId] = useState('');
    const [stockCustomerName, setStockCustomerName] = useState('');

    const resetForm = () => {
        setCustomerName('');
        setCustomerEmail('');
        setCustomerPhone('');
        setCustomerCompany('');
        setCustomerAddress('');
        setMode('customer');
    };

    const generateQuoteNumber = () => {
        const ts = Date.now().toString(36).toUpperCase().slice(-5);
        const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `${orgCode}-Q${ts}${rand}`;
    };

    const generateStockNumber = () => {
        const ts = Date.now().toString(36).toUpperCase().slice(-5);
        const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `${orgCode}-S${ts}${rand}`;
    };

    const buildQuotePayload = () => {
        const { model, vendor, range, module, rangeId, activeVariant, selectedOptionsData, customOptions, selectedMotor, selectedMotorAccessories, selectedTrailerOptionsData, selectedDealerFitData, totalPrice, isRegoSelected, isStickerSelected, isTenderToSelected, isTrailerRegoSelected, selectedTrailerId, appliedPromotions, dealerServices } = quoteData;

        return {
            // Quote metadata
            quoteNumber: generateQuoteNumber(),
            status: (mode === 'customer' ? 'proposal' : 'stock') as string,
            createdAt: serverTimestamp(),
            createdByUid: user?.uid || null,
            createdByName: userProfile?.displayName || user?.displayName || 'Unknown',
            organisationId: organisationId || null,

            // Customer (if applicable)
            ...(mode === 'customer' ? {
                customer: {
                    name: customerName || '',
                    email: customerEmail || '',
                    phone: customerPhone || '',
                    company: customerCompany || '',
                    address: customerAddress || '',
                },
            } : {}),

            // Module + Vendor context
            moduleId: module?.id || null,
            moduleName: module?.name || null,
            moduleSlug: module?.slug || null,
            vendorId: vendor?.id || null,
            vendorName: vendor?.name || null,
            vendorLogoUrl: vendor?.logoUrl || null,
            vendorCurrency: vendor?.currency || null,
            rangeId: rangeId || null,
            rangeName: range?.name || null,
            rangeImageUrl: range?.imageUrl || null,

            // Model
            modelId: model?.id || null,
            modelName: model?.name || null,
            modelCode: model?.modelCode || null,
            coverImageUrl: model?.coverImageUrl || null,
            specifications: model?.specifications || null,
            standardFeatures: model?.standardFeatures || null,

            // Variant (boat base)
            variant: activeVariant ? {
                id: activeVariant.id || null,
                name: activeVariant.name || 'Standard',
                sku: activeVariant.sku || null,
                colorName: activeVariant.colorName || null,
                colorCode: activeVariant.colorCode || null,
                material: activeVariant.material || null,
                cost: activeVariant.cost || 0,
                sellPriceExclGst: activeVariant.sellPriceExclGst || 0,
                imageUrl: activeVariant.imageUrl || null,
            } : null,

            // Factory Options
            selectedOptions: (selectedOptionsData || []).map(opt => ({
                id: opt.id || null,
                name: opt.name || 'Unnamed Option',
                category: opt.category || null,
                sellPriceExclGst: opt.sellPriceExclGst || 0,
                imageUrl: opt.imageUrl || null,
            })),
            customOptions: (customOptions || []).map(opt => ({
                id: opt.id || null,
                name: opt.name || 'Custom Option',
                sellPriceExclGst: opt.sellPriceExclGst || 0,
                description: opt.description || null,
            })),

            // Registration
            registration: {
                boatRego: isRegoSelected || false,
                boatRegoPrice: isRegoSelected ? (model?.registration?.price12Months || 0) : 0,
                sticker: isStickerSelected || false,
                stickerPrice: isStickerSelected ? (model?.registration?.stickerPrice || 0) : 0,
                tenderTo: isTenderToSelected || false,
                tenderToPrice: isTenderToSelected ? (model?.registration?.tenderToStickerPrice || 0) : 0,
                trailerRego: isTrailerRegoSelected || false,
                trailerRegoPrice: isTrailerRegoSelected ? (model?.registration?.trailerPrice12Months || 0) : 0,
            },

            // Motor
            motor: selectedMotor ? (() => {
                // Normalize field-name lookup to handle any casing/spacing in the source data
                const allKeys = Object.keys(selectedMotor);
                const norm = (s: string) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');
                const nameKey = allKeys.find(k => ['modelname', 'model', 'description', 'name'].includes(norm(k)));
                const motorName = (nameKey ? selectedMotor[nameKey] : null) || 'Unknown Motor';
                return {
                id: selectedMotor.id || null,
                name: motorName,
                model: motorName,
                brand: selectedMotor.brand || 'Yamaha',
                brandLogoUrl: selectedMotor.vendorLogoUrl || null,
                sellPriceExclGst: selectedMotor.sellPriceExclGst || 0,
                imageUrl: selectedMotor.imageUrl || selectedMotor.SummaryImage || null,
                // Motor spec fields (may not be present on all motors)
                hpRating: selectedMotor['HP Rating'] || selectedMotor.hp || null,
                shaftLength: selectedMotor['Shaft Length'] || selectedMotor.shaft || null,
                control: selectedMotor['Control'] || selectedMotor.control || null,
                starting: selectedMotor['Starting'] || selectedMotor.starting || null,
                tiltTrim: selectedMotor['Tilt & Trim'] || selectedMotor.tiltTrim || null,
                fuelTank: selectedMotor['Fuel Tank'] || selectedMotor.fuelTank || null,
                prop: selectedMotor['Prop'] || selectedMotor.prop || null,
                warranty: selectedMotor['Warranty'] || selectedMotor.warranty || null,
                accessories: (selectedMotorAccessories || []).map((a: any) => ({
                    id: a.id || null,
                    name: a.name || 'Unnamed Accessory',
                    category: a.category || null,
                    sellPriceExclGst: a.sellPriceExclGst || 0,
                })),
                }; })() : null,

            // Trailer
            trailer: (selectedTrailerId && model?.trailerConfig) ? {
                id: selectedTrailerId,
                name: model.trailerConfig.name || 'Trailer Package',
                sellPriceExclGst: model.trailerConfig.sellPriceExclGst || 0,
                imageUrl: model.trailerConfig.imageUrl || null,
                options: (selectedTrailerOptionsData || []).map((o: any) => ({
                    id: o.id || null,
                    name: o.name || 'Trailer Option',
                    sellPriceExclGst: o.sellPriceExclGst || 0,
                })),
            } : null,

            // Dealer Fit
            dealerFit: (selectedDealerFitData || []).map((sel: any) => ({
                id: sel.id || null,
                name: sel.name || 'Dealer Fit',
                category: sel.category || null,
                items: (sel.items || []).map((i: any) => ({
                    // Firestore warehouse items may use various field names for the display label
                    name: i.data?.['OPERATION DESCRIPTION'] || i.data?.ITEM_NAME || i.data?.['Product Name'] || i.data?.name || i.data?.Name || i.data?.Description || i.data?.description || i.name || 'Item',
                    sellPriceExclGst: i.data?.sellPriceExclGst || i.data?.PARTS || i.data?.RRP || i.data?.Price || i.data?.Retail || i.data?.Trade || 0,
                    imageUrl: i.data?.imageLink || i.data?.['Image Link'] || i.data?.imageUrl || i.data?.image || i.data?.SummaryImage || null,
                })),
            })),

            // Applied Promotions
            appliedPromotions: appliedPromotions || [],

            // Dealer Services
            dealerServices: dealerServices || { extendedWarranty: false, servicePlan: false },

            // Pricing
            priceLevelUsed: quoteData.priceLevelUsed || 'default',
            totalPriceExclGst: totalPrice || 0,
        };
    };

    const handleFinalize = async () => {
        if (!user) return;

        if (mode === 'customer' && !customerName.trim()) {
            toast({ variant: 'destructive', title: 'Customer name is required' });
            return;
        }

        setIsSaving(true);
        try {
            const payload = buildQuotePayload();

            if (mode === 'customer') {
                // Save quote under user's quotes subcollection
                const quoteRef = doc(firestoreCollection(firestore, `users/${user.uid}/quotes`));
                await setDoc(quoteRef, { ...payload, id: quoteRef.id });
                toast({ title: 'Proposal Created', description: `Quote ${payload.quoteNumber} has been saved.` });
                onOpenChange(false);
                resetForm();
                router.push(`/modules/${quoteData.module?.slug || quoteData.module?.id}/proposals/${quoteRef.id}`);
            } else {
                // Save as stock in inventory collection
                if (!organisationId) {
                    toast({ variant: 'destructive', title: 'Organisation required to save as stock' });
                    setIsSaving(false);
                    return;
                }
                const finalStockNumber = stockNumber || generateStockNumber();
                const inventoryRef = doc(firestoreCollection(firestore, 'inventory'));
                await setDoc(inventoryRef, {
                    ...payload,
                    stockNumber: finalStockNumber,
                    status: stockStatus,
                    name: `${quoteData.model?.name || 'Unit'} - ${quoteData.activeVariant?.colorName || quoteData.activeVariant?.name || 'Standard'}`,
                    // Locked configuration fields
                    isLocked: true,
                    isFromQuote: true,
                    quoteId: inventoryRef.id,
                    quotePayload: payload,
                    proposalPdfUrl: null,
                    // Flattened fields for stock table
                    model: payload.modelName || payload.modelCode || '',
                    colour: payload.variant?.colorName || '',
                    serialNumber: '',
                    material: payload.variant?.material || '',
                    location: stockLocation,
                    customerId: stockCustomerId || null,
                    customerName: stockCustomerName || null,
                    soldBy: '',
                    label: payload.variant?.sku || '',
                    notes: '',
                    dateIntoStock: serverTimestamp(),
                    photoUrls: payload.variant?.imageUrl ? [payload.variant.imageUrl] : [],
                    pdfAttachments: [],
                    coverImageUrl: payload.coverImageUrl || null,
                    variantImageUrl: payload.variant?.imageUrl || null,
                });

                // Generate and store PDF
                try {
                    const totalPromoDiscount = (payload.appliedPromotions || []).reduce((sum: number, p: any) => sum + (p.discount || 0), 0);
                    const financials = buildQuoteFinancials(payload, totalPromoDiscount);
                    const pdfBlob = await pdf(<ProposalPDFDocument quote={payload} organisation={organisation} financials={financials} />).toBlob();
                    if (!pdfBlob || pdfBlob.size === 0) {
                        throw new Error('PDF generation returned an empty blob');
                    }
                    const pdfFile = new File([pdfBlob], `${finalStockNumber}-proposal.pdf`, { type: 'application/pdf' });
                    const pdfUrl = await uploadFileToStorage(storage, pdfFile, `inventory/${inventoryRef.id}/proposal-${finalStockNumber}.pdf`);

                    if (!pdfUrl || typeof pdfUrl !== 'string') {
                        throw new Error('PDF upload returned an invalid URL');
                    }

                    await updateDoc(doc(firestore, 'inventory', inventoryRef.id), {
                        proposalPdfUrl: pdfUrl,
                    });
                } catch (pdfError) {
                    console.error('Failed to generate/store proposal PDF:', pdfError);
                    toast({
                        variant: 'destructive',
                        title: 'PDF Generation Failed',
                        description: 'Stock item was created but the proposal PDF could not be generated. You can re-generate it from the stock detail panel.',
                    });
                    // Don't fail the whole operation — stock item is already created
                }

                toast({ title: 'Stock Item Created', description: `${finalStockNumber} added to inventory.` });
                onStockCreated?.();
                onOpenChange(false);
                resetForm();
                router.push(`/modules/${quoteData.module?.slug || quoteData.module?.id}`);
            }
        } catch (error: any) {
            console.error('Failed to finalize:', error);
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message || 'Could not save the quote.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); onOpenChange(open); }}>
            <DialogContent className="sm:max-w-2xl rounded-[2rem] border-4 shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-8 pb-4 border-b bg-gradient-to-br from-primary/5 to-transparent">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg">
                            <Anchor className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-black uppercase tracking-tight">Finalize Project</DialogTitle>
                            <DialogDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mt-0.5">
                                {quoteData.model?.name} &bull; {quoteData.activeVariant?.colorName || quoteData.activeVariant?.name}
                            </DialogDescription>
                        </div>
                    </div>

                    {/* Total Price Banner */}
                    <div className="flex items-center justify-between bg-slate-900 text-white rounded-xl p-4 mt-4">
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 opacity-60" />
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Excl. GST</span>
                        </div>
                        <span className="text-2xl font-black">${quoteData.totalPrice.toLocaleString()}</span>
                    </div>
                </DialogHeader>

                <ScrollArea className="max-h-[50vh]">
                    <div className="p-8 pt-6 space-y-6">
                        {/* Mode Toggle */}
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Finalization Type</Label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setMode('customer')}
                                    className={cn(
                                        "flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all",
                                        mode === 'customer'
                                            ? "border-primary bg-primary/5 shadow-lg"
                                            : "border-muted hover:border-primary/30"
                                    )}
                                >
                                    <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", mode === 'customer' ? "bg-primary text-white" : "bg-muted")}>
                                        <User className="h-5 w-5" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[11px] font-black uppercase tracking-tight">Customer Proposal</p>
                                        <p className="text-[9px] text-muted-foreground mt-0.5">Create a quote for a client</p>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { if (canSaveAsStock) setMode('stock'); }}
                                    disabled={!canSaveAsStock}
                                    title={!canSaveAsStock ? "You don't have permission to save as stock" : undefined}
                                    className={cn(
                                        "flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all",
                                        !canSaveAsStock && "opacity-40 cursor-not-allowed",
                                        mode === 'stock'
                                            ? "border-primary bg-primary/5 shadow-lg"
                                            : "border-muted hover:border-primary/30"
                                    )}
                                >
                                    <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", mode === 'stock' ? "bg-primary text-white" : "bg-muted")}>
                                        <Box className="h-5 w-5" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[11px] font-black uppercase tracking-tight">Save as Stock</p>
                                        <p className="text-[9px] text-muted-foreground mt-0.5">
                                            {canSaveAsStock ? 'Add unit to org inventory' : 'Permission required'}
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {mode === 'customer' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <Separator />
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer Details</Label>

                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cust-name" className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                            <User className="h-3 w-3" /> Full Name <span className="text-destructive">*</span>
                                        </Label>
                                        <Input id="cust-name" placeholder="John Smith" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-11 rounded-xl border-2 font-bold text-sm" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="cust-email" className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                                <Mail className="h-3 w-3" /> Email
                                            </Label>
                                            <Input id="cust-email" type="email" placeholder="john@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="h-11 rounded-xl border-2 font-bold text-sm" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="cust-phone" className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                                <Phone className="h-3 w-3" /> Phone
                                            </Label>
                                            <Input id="cust-phone" type="tel" placeholder="+61 400 000 000" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-11 rounded-xl border-2 font-bold text-sm" />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="cust-company" className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                            <Building className="h-3 w-3" /> Company
                                        </Label>
                                        <Input id="cust-company" placeholder="Company name (optional)" value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} className="h-11 rounded-xl border-2 font-bold text-sm" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="cust-address" className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                            <MapPin className="h-3 w-3" /> Address
                                        </Label>
                                        <Input id="cust-address" placeholder="Full address (optional)" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="h-11 rounded-xl border-2 font-bold text-sm" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {mode === 'stock' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <Separator />
                                <div className="bg-muted/30 rounded-xl p-6 border-2 border-dashed text-center space-y-3">
                                    <Box className="h-10 w-10 text-primary/40 mx-auto" />
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-tight">Organisation Stock</p>
                                        <p className="text-[9px] text-muted-foreground mt-1">
                                            This build configuration will be saved directly to your organisation's inventory. No customer will be associated with this unit.
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest">
                                        {organisation?.name || 'Your Organisation'}
                                    </Badge>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="p-8 pt-4 border-t bg-muted/5 gap-3">
                    <DialogClose asChild>
                        <Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2">Cancel</Button>
                    </DialogClose>
                    <Button
                        onClick={handleFinalize}
                        disabled={isSaving || (mode === 'customer' && !customerName.trim())}
                        className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl transition-all hover:scale-[1.02] active:scale-95"
                    >
                        {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        {mode === 'customer' ? 'Create Proposal' : 'Save to Stock'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
