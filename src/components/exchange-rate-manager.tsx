'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp, where, updateDoc } from 'firebase/firestore';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter,
    DialogClose 
} from '@/components/ui/dialog';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { 
    Loader2, 
    Plus, 
    Trash2, 
    Coins, 
    CheckCircle2, 
    History, 
    ArrowRightLeft, 
    Maximize2, 
    Minimize2,
    RefreshCw,
    Star,
    Building,
    ChevronDown,
    ChevronRight,
    Link2,
    ShieldCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SUPPORTED_CURRENCIES } from '@/lib/currency-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ExchangeRate {
    id: string;
    code: string;
    rate: number;
    updatedAt: any;
}

interface Vendor {
    id: string;
    name: string;
    currency?: string;
    logoUrl?: string;
}

interface Organisation {
    id: string;
    tradingCurrency?: string;
    dataWarehouseSubscriptions?: string[];
}

export function ExchangeRateManager({ 
    organisationId, 
    isOpen, 
    onClose 
}: { 
    organisationId: string; 
    isOpen: boolean; 
    onClose: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    // 1. Fetch Rates
    const ratesQuery = useMemoFirebase(() => 
        query(collection(firestore, `organisations/${organisationId}/exchangeRates`), orderBy('code')),
    [firestore, organisationId]);
    const { data: rates, loading: ratesLoading } = useCollection<ExchangeRate>(ratesQuery);

    // 2. Fetch Organisation
    const orgRef = useMemoFirebase(() => doc(firestore, 'organisations', organisationId), [firestore, organisationId]);
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(orgRef);

    // 3. Fetch Subscribed Vendors
    const subscribedBrandIds = organisation?.dataWarehouseSubscriptions || [];
    const vendorsQuery = useMemoFirebase(() => {
        if (subscribedBrandIds.length === 0) return null;
        return query(collection(firestore, 'data-warehouse'), where('__name__', 'in', subscribedBrandIds));
    }, [firestore, subscribedBrandIds]);
    const { data: vendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

    const [isAdding, setIsAdding] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [newRate, setNewRate] = useState('1.0');
    const [expandedCurrency, setExpandedCurrency] = useState<string | null>(null);

    const handleAddRate = async () => {
        if (!newCode || !newRate) return;
        try {
            const rateRef = doc(firestore, `organisations/${organisationId}/exchangeRates`, newCode);
            await setDoc(rateRef, {
                code: newCode,
                rate: parseFloat(newRate),
                updatedAt: serverTimestamp()
            });
            toast({ title: "Exchange Rate Added", description: `1 ${newCode} initialized.` });
            setIsAdding(false);
            setNewCode('');
            setNewRate('1.0');
        } catch (e) {
            toast({ variant: 'destructive', title: "Failed to add rate" });
        }
    };

    const handleUpdateRate = async (code: string, rate: string) => {
        const val = parseFloat(rate);
        if (isNaN(val)) return;
        try {
            const rateRef = doc(firestore, `organisations/${organisationId}/exchangeRates`, code);
            await setDoc(rateRef, {
                rate: val,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (e) {
            toast({ variant: 'destructive', title: "Update Failed" });
        }
    };

    const handleSetDefault = async (code: string) => {
        try {
            await updateDoc(doc(firestore, 'organisations', organisationId), {
                tradingCurrency: code
            });
            toast({ title: "Default Currency Updated", description: `${code} is now your base trading currency.` });
        } catch (e) {
            toast({ variant: 'destructive', title: "Failed to update default" });
        }
    };

    const handleDeleteRate = async (code: string) => {
        if (organisation?.tradingCurrency === code) {
            toast({ variant: 'destructive', title: "Action Blocked", description: "Cannot remove your default trading currency." });
            return;
        }
        try {
            await deleteDoc(doc(firestore, `organisations/${organisationId}/exchangeRates`, code));
            toast({ title: "Rate Removed" });
        } catch (e) {
            toast({ variant: 'destructive', title: "Delete Failed" });
        }
    };

    const handleAssignVendor = async (vendorId: string, currencyCode: string) => {
        try {
            const vendorRef = doc(firestore, 'data-warehouse', vendorId);
            await updateDoc(vendorRef, { currency: currencyCode });
            toast({ title: "Vendor Reassigned", description: `Vendor currency set to ${currencyCode}.` });
        } catch (e) {
            toast({ variant: 'destructive', title: "Reassignment Failed" });
        }
    };

    const availableToChoose = useMemo(() => {
        const activeCodes = (rates || []).map(r => r.code);
        return SUPPORTED_CURRENCIES.filter(c => !activeCodes.includes(c.code));
    }, [rates]);

    const loading = ratesLoading || orgLoading || vendorsLoading;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw] w-[1100px] h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border-4 shadow-2xl [&>button]:hidden">
                <div className="flex flex-col h-full bg-background">
                    {/* Header */}
                    <div className="p-8 border-b bg-muted/5 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-inner">
                                    <Coins className="h-6 w-6" />
                                </div>
                                <div className="space-y-1">
                                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Global Exchange Rates</DialogTitle>
                                    <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Financial Configuration Workspace</DialogDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button 
                                    onClick={() => setIsAdding(true)} 
                                    className="h-10 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg rounded-xl transition-all hover:scale-105"
                                >
                                    <Plus className="h-4 w-4 mr-2" /> Add Currency
                                </Button>
                                <DialogClose asChild>
                                    <Button variant="ghost" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-accent border-2">
                                        <Minimize2 className="h-4 w-4 mr-2" /> Collapse
                                    </Button>
                                </DialogClose>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-h-0">
                        {loading ? (
                            <div className="flex h-full w-full items-center justify-center">
                                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            </div>
                        ) : rates && rates.length > 0 ? (
                            <ScrollArea className="h-full">
                                <div className="p-8">
                                    <div className="rounded-3xl border-2 overflow-hidden bg-card shadow-sm">
                                        <Table>
                                            <TableHeader className="bg-muted/50 border-b-2">
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="w-[60px]"></TableHead>
                                                    <TableHead className="w-[180px] py-5 px-4 font-black uppercase text-[10px] tracking-widest">ISO Code</TableHead>
                                                    <TableHead className="w-[120px] text-center font-black uppercase text-[10px] tracking-widest">Default</TableHead>
                                                    <TableHead className="w-[220px] py-5 px-4 font-black uppercase text-[10px] tracking-widest">Manual Rate</TableHead>
                                                    <TableHead className="w-[140px] text-center font-black uppercase text-[10px] tracking-widest">Vendors</TableHead>
                                                    <TableHead className="py-5 px-4 font-black uppercase text-[10px] tracking-widest">Last Precision Sync</TableHead>
                                                    <TableHead className="text-right py-5 px-8 font-black uppercase text-[10px] tracking-widest w-[100px]">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {rates.map((rate) => {
                                                    const isDefault = organisation?.tradingCurrency === rate.code;
                                                    const mappedVendors = vendors?.filter(v => v.currency === rate.code) || [];
                                                    const isExpanded = expandedCurrency === rate.code;

                                                    return (
                                                        <React.Fragment key={rate.code}>
                                                            <TableRow className={cn("hover:bg-primary/5 transition-colors group", isExpanded && "bg-primary/5")}>
                                                                <TableCell className="text-center p-0 align-middle">
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-10 w-10 hover:bg-primary/10 rounded-full"
                                                                        onClick={() => setExpandedCurrency(isExpanded ? null : rate.code)}
                                                                    >
                                                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                    </Button>
                                                                </TableCell>
                                                                <TableCell className="py-4 px-4 align-middle">
                                                                    <div className="flex items-center gap-3">
                                                                        <Badge className={cn("font-black text-xs h-8 w-14 justify-center shadow-md shrink-0", isDefault ? "bg-primary" : "bg-muted text-muted-foreground")}>
                                                                            {rate.code}
                                                                        </Badge>
                                                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider truncate max-w-[80px]">
                                                                            {SUPPORTED_CURRENCIES.find(c => c.code === rate.code)?.label.split('(')[0]}
                                                                        </span>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-center align-middle">
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className={cn(
                                                                            "h-10 w-10 rounded-full transition-all",
                                                                            isDefault ? "text-primary bg-primary/10" : "text-muted-foreground/30 hover:text-primary hover:bg-primary/5"
                                                                        )}
                                                                        onClick={() => handleSetDefault(rate.code)}
                                                                    >
                                                                        <Star className={cn("h-4 w-4", isDefault && "fill-current")} />
                                                                    </Button>
                                                                </TableCell>
                                                                <TableCell className="py-4 px-4 align-middle">
                                                                    <div className="relative max-w-[140px]">
                                                                        <ArrowRightLeft className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary opacity-40" />
                                                                        <Input 
                                                                            type="number" 
                                                                            step="0.0001"
                                                                            defaultValue={rate.rate}
                                                                            onBlur={(e) => handleUpdateRate(rate.code, e.target.value)}
                                                                            className="pl-8 h-9 font-black text-xs border-2 focus-visible:ring-primary/20 bg-background shadow-inner"
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-center align-middle">
                                                                    <Badge variant="outline" className="font-black text-[10px] h-7 px-3 bg-muted/20 border-primary/10 text-primary">
                                                                        {mappedVendors.length} Brands
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="py-4 px-4 align-middle">
                                                                    <div className="flex items-center gap-2.5 text-muted-foreground">
                                                                        <History className="h-4 w-4 opacity-40" />
                                                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                                                            {rate.updatedAt ? formatDistanceToNow(new Date(rate.updatedAt.seconds * 1000), { addSuffix: true }) : 'Sync Pending'}
                                                                        </span>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right py-4 px-8 align-middle">
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-9 w-9 text-destructive opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 rounded-xl"
                                                                        onClick={() => handleDeleteRate(rate.code)}
                                                                        disabled={isDefault}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                            
                                                            {isExpanded && (
                                                                <TableRow className="bg-primary/5 hover:bg-primary/5 border-none">
                                                                    <TableCell colSpan={7} className="p-0">
                                                                        <div className="p-6 pt-0 ml-[60px] animate-in slide-in-from-top-2 duration-300">
                                                                            <div className="bg-background rounded-3xl border-2 shadow-2xl overflow-hidden border-primary/10">
                                                                                <div className="p-5 border-b bg-muted/10 flex items-center justify-between">
                                                                                    <div className="flex items-center gap-2.5">
                                                                                        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                                                                                            <Building className="h-4 w-4 text-primary" />
                                                                                        </div>
                                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Associated Brands ({rate.code})</span>
                                                                                    </div>
                                                                                    <Select onValueChange={(vId) => handleAssignVendor(vId, rate.code)}>
                                                                                        <SelectTrigger className="h-9 w-[220px] text-[10px] font-black uppercase tracking-widest border-dashed border-2 hover:bg-primary/5 hover:border-primary/30 transition-all">
                                                                                            <Plus className="h-3 w-3 mr-2" />
                                                                                            <SelectValue placeholder="Map Brand to Currency" />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent>
                                                                                            {vendors?.filter(v => v.currency !== rate.code).map(v => (
                                                                                                <SelectItem key={v.id} value={v.id} className="text-[10px] font-black uppercase tracking-widest">{v.name}</SelectItem>
                                                                                            ))}
                                                                                        </SelectContent>
                                                                                    </Select>
                                                                                </div>
                                                                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                                    {mappedVendors.length > 0 ? mappedVendors.map(vendor => (
                                                                                        <div key={vendor.id} className="flex items-center justify-between p-4 rounded-2xl border-2 bg-muted/5 group/vendor hover:border-primary/20 hover:bg-white transition-all">
                                                                                            <div className="flex items-center gap-4">
                                                                                                <div className="h-10 w-10 bg-white rounded-xl border p-1.5 shadow-sm">
                                                                                                    {vendor.logoUrl ? (
                                                                                                        <img src={vendor.logoUrl} alt={vendor.name} className="h-full w-full object-contain" />
                                                                                                    ) : (
                                                                                                        <Building className="h-5 w-5 m-auto mt-1 text-muted-foreground/30" />
                                                                                                    )}
                                                                                                </div>
                                                                                                <span className="text-[11px] font-black uppercase tracking-tight">{vendor.name}</span>
                                                                                            </div>
                                                                                            <Button 
                                                                                                variant="ghost" 
                                                                                                size="icon" 
                                                                                                className="h-8 w-8 text-muted-foreground opacity-0 group-hover/vendor:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                                                                                                onClick={() => handleAssignVendor(vendor.id, 'AUD')}
                                                                                            >
                                                                                                <Link2 className="h-4 w-4" />
                                                                                            </Button>
                                                                                        </div>
                                                                                    )) : (
                                                                                        <div className="col-span-full py-12 text-center">
                                                                                            <div className="opacity-20 flex flex-col items-center gap-3">
                                                                                                <Link2 className="h-8 w-8" />
                                                                                                <p className="text-[10px] font-black uppercase tracking-widest">No brands currently associated with {rate.code}</p>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    
                                    <div className="mt-8 p-6 rounded-3xl bg-primary/5 border-2 border-primary/10 flex items-start gap-5">
                                        <div className="h-12 w-12 bg-white rounded-2xl shadow-md flex items-center justify-center shrink-0 border-2 border-primary/5">
                                            <ShieldCheck className="h-6 w-6 text-primary" />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-black uppercase tracking-tight text-primary">Strategic Configuration Note</h4>
                                            <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-3xl">
                                                The designated default currency represents your organization's local trading base. All master vendor pricing is automatically converted into this base for live building and quotation workflows. Manual rates should be reviewed periodically against market volatility to maintain profitability.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-12">
                                <Coins className="h-24 w-24 text-muted-foreground/10 mb-8" />
                                <h3 className="text-2xl font-black uppercase tracking-tight text-muted-foreground/60">No Active Exchange Rates</h3>
                                <p className="text-sm text-muted-foreground max-w-md mt-3 font-medium leading-relaxed">Add major currencies to begin translating master vendor data into your local trading currency. This is required for all international logistics and pricing strategies.</p>
                                <Button onClick={() => setIsAdding(true)} className="mt-10 h-14 px-10 font-black uppercase tracking-widest text-xs rounded-[1.5rem] shadow-2xl transition-all hover:scale-105 active:scale-95">
                                    Initialize Currency Matrix
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Add Currency Dialog */}
                <Dialog open={isAdding} onOpenChange={setIsAdding}>
                    <DialogContent className="sm:max-w-md rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                        <DialogHeader className="p-8 border-b bg-muted/5">
                            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Add Strategic Currency</DialogTitle>
                            <DialogDescription className="text-[10px] font-black uppercase text-primary tracking-[0.2em] mt-1">Global Financial Matrix Integration</DialogDescription>
                        </DialogHeader>
                        <div className="p-8 space-y-8">
                            <div className="space-y-2.5">
                                <Label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70 ml-1">1. ISO Currency Code</Label>
                                <Select value={newCode} onValueChange={setNewCode}>
                                    <SelectTrigger className="h-14 font-black text-sm border-2 rounded-2xl shadow-sm">
                                        <SelectValue placeholder="Select ISO Target..." />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl shadow-2xl border-2">
                                        {availableToChoose.map(c => (
                                            <SelectItem key={c.code} value={c.code} className="font-bold py-3">{c.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2.5">
                                <Label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70 ml-1">2. Initial Exchange Rate</Label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 bg-primary/10 rounded-lg flex items-center justify-center">
                                        <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <Input 
                                        type="number" 
                                        step="0.0001" 
                                        value={newRate} 
                                        onChange={e => setNewRate(e.target.value)}
                                        className="pl-14 h-14 font-black text-xl border-2 rounded-2xl bg-muted/5 shadow-inner"
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                            <Button variant="outline" onClick={() => setIsAdding(false)} className="h-12 px-8 font-black uppercase tracking-widest text-[10px] rounded-2xl border-2 transition-all hover:bg-background">Cancel</Button>
                            <Button onClick={handleAddRate} disabled={!newCode} className="h-12 px-10 font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Link Currency
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}
