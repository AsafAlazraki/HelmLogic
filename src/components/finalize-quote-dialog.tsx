'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { doc, setDoc, serverTimestamp, collection as firestoreCollection } from 'firebase/firestore';
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
    FileText,
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
    };
    organisationId: string | null;
    userProfile: any;
}

type FinalizeMode = 'customer' | 'stock';

export function FinalizeQuoteDialog({ isOpen, onOpenChange, quoteData, organisationId, userProfile }: FinalizeQuoteDialogProps) {
    const firestore = useFirestore();
    const { user } = useUser();
    const router = useRouter();
    const { toast } = useToast();

    const [mode, setMode] = useState<FinalizeMode>('customer');
    const [isSaving, setIsSaving] = useState(false);

    // Customer fields
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerCompany, setCustomerCompany] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');

    const resetForm = () => {
        setCustomerName('');
        setCustomerEmail('');
        setCustomerPhone('');
        setCustomerCompany('');
        setCustomerAddress('');
        setMode('customer');
    };

    const generateQuoteNumber = () => {
        const orgCode = userProfile?.organisationShortCode || 'HL';
        const ts = Date.now().toString(36).toUpperCase().slice(-5);
        const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `${orgCode}-Q${ts}${rand}`;
    };

    const generateStockNumber = () => {
        const orgCode = userProfile?.organisationShortCode || 'HL';
        const ts = Date.now().toString(36).toUpperCase().slice(-5);
        const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `${orgCode}-S${ts}${rand}`;
    };

    const buildQuotePayload = () => {
        const { model, vendor, range, module, rangeId, activeVariant, selectedOptionsData, customOptions, selectedMotor, selectedMotorAccessories, selectedTrailerOptionsData, selectedDealerFitData, totalPrice, isRegoSelected, isStickerSelected, isTenderToSelected, isTrailerRegoSelected, selectedTrailerId } = quoteData;

        return {
            // Quote metadata
            quoteNumber: generateQuoteNumber(),
            status: mode === 'customer' ? 'proposal' : 'stock',
            createdAt: serverTimestamp(),
            createdByUid: user?.uid,
            createdByName: userProfile?.displayName || user?.displayName || 'Unknown',
            organisationId: organisationId,

            // Customer (if applicable)
            ...(mode === 'customer' ? {
                customer: {
                    name: customerName,
                    email: customerEmail,
                    phone: customerPhone,
                    company: customerCompany,
                    address: customerAddress,
                },
            } : {}),

            // Module + Vendor context
            moduleId: module?.id,
            moduleName: module?.name,
            vendorId: vendor?.id,
            vendorName: vendor?.name,
            vendorLogoUrl: vendor?.logoUrl || null,
            vendorCurrency: vendor?.currency || null,
            rangeId: rangeId,
            rangeName: range?.name || null,
            rangeImageUrl: range?.imageUrl || null,

            // Model
            modelId: model?.id,
            modelName: model?.name,
            modelCode: model?.modelCode || null,
            coverImageUrl: model?.coverImageUrl || null,
            specifications: model?.specifications || null,
            standardFeatures: model?.standardFeatures || null,

            // Variant (boat base)
            variant: activeVariant ? {
                id: activeVariant.id,
                name: activeVariant.name,
                sku: activeVariant.sku,
                colorName: activeVariant.colorName,
                colorCode: activeVariant.colorCode,
                material: activeVariant.material,
                cost: activeVariant.cost,
                sellPriceExclGst: activeVariant.sellPriceExclGst,
                imageUrl: activeVariant.imageUrl,
            } : null,

            // Factory Options
            selectedOptions: selectedOptionsData.map(opt => ({
                id: opt.id,
                name: opt.name,
                category: opt.category || null,
                sellPriceExclGst: opt.sellPriceExclGst || 0,
                imageUrl: opt.imageUrl || null,
            })),
            customOptions: customOptions.map(opt => ({
                id: opt.id,
                name: opt.name,
                sellPriceExclGst: opt.sellPriceExclGst || 0,
                description: opt.description || null,
            })),

            // Registration
            registration: {
                boatRego: isRegoSelected,
                boatRegoPrice: isRegoSelected ? (model?.registration?.price12Months || 0) : 0,
                sticker: isStickerSelected,
                stickerPrice: isStickerSelected ? (model?.registration?.stickerPrice || 0) : 0,
                tenderTo: isTenderToSelected,
                tenderToPrice: isTenderToSelected ? (model?.registration?.tenderToStickerPrice || 0) : 0,
                trailerRego: isTrailerRegoSelected,
                trailerRegoPrice: isTrailerRegoSelected ? (model?.registration?.trailerPrice12Months || 0) : 0,
            },

            // Motor
            motor: selectedMotor ? {
                id: selectedMotor.id,
                name: selectedMotor.name,
                model: selectedMotor.model || selectedMotor.name,
                brand: selectedMotor.brand || null,
                sellPriceExclGst: selectedMotor.sellPriceExclGst || 0,
                imageUrl: selectedMotor.imageUrl || selectedMotor.SummaryImage || null,
                accessories: selectedMotorAccessories.map((a: any) => ({
                    id: a.id,
                    name: a.name,
                    category: a.category || null,
                    sellPriceExclGst: a.sellPriceExclGst || 0,
                })),
            } : null,

            // Trailer
            trailer: selectedTrailerId && quoteData.model.trailerConfig ? {
                id: selectedTrailerId,
                name: quoteData.model.trailerConfig.name || 'Trailer Package',
                sellPriceExclGst: quoteData.model.trailerConfig.sellPriceExclGst || 0,
                imageUrl: quoteData.model.trailerConfig.imageUrl || null,
                options: selectedTrailerOptionsData.map((o: any) => ({
                    id: o.id,
                    name: o.name,
                    sellPriceExclGst: o.sellPriceExclGst || 0,
                })),
            } : null,

            // Dealer Fit
            dealerFit: selectedDealerFitData.map((sel: any) => ({
                id: sel.id,
                name: sel.name,
                category: sel.category || null,
                items: sel.items?.map((i: any) => ({
                    name: i.data?.name || i.name,
                    sellPriceExclGst: i.data?.sellPriceExclGst || 0,
                })) || [],
            })),

            // Pricing
            totalPriceExclGst: totalPrice,
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
                await setDoc(quoteRef, payload);
                toast({ title: 'Proposal Created', description: `Quote ${payload.quoteNumber} has been saved.` });
                onOpenChange(false);
                resetForm();
                router.push(`/modules/${quoteData.module?.id}/proposals/${quoteRef.id}`);
            } else {
                // Save as stock in inventory collection
                const stockNumber = generateStockNumber();
                const inventoryRef = doc(firestoreCollection(firestore, 'inventory'));
                await setDoc(inventoryRef, {
                    ...payload,
                    stockNumber,
                    status: 'In Stock',
                    name: `${quoteData.model?.name || 'Unit'} - ${quoteData.activeVariant?.colorName || quoteData.activeVariant?.name || 'Standard'}`,
                });
                toast({ title: 'Stock Item Created', description: `${stockNumber} added to inventory.` });
                onOpenChange(false);
                resetForm();
                router.push(`/modules/${quoteData.module?.id}`);
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
                                    onClick={() => setMode('stock')}
                                    className={cn(
                                        "flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all",
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
                                        <p className="text-[9px] text-muted-foreground mt-0.5">Add unit to org inventory</p>
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
                                        {userProfile?.organisationName || 'Your Organisation'}
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
