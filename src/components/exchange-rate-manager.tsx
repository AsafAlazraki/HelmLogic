
'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './badge';
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
                                                                <TableCell className="text-center p-0">
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-8 w-8 hover:bg-primary/10 rounded-full"
                                                                        onClick={() => setExpandedCurrency(isExpanded ? null : rate.code)}
                                                                    >
                                                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                    </Button>
                                                                </TableCell>
                                                                <TableCell className="py-4 px-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <Badge className={cn("font-black text-xs h-8 w-14 justify-center shadow-md", isDefault ? "bg-primary" : "bg-muted text-muted-foreground")}>
                                                                            {rate.code}
                                                                        </Badge>
                                                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider truncate max-w-[80px]">
                                                                            {SUPPORTED_CURRENCIES.find(c => c.code === rate.code)?.label.split('(')[0]}
                                                                        </span>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-center">
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className={cn(
                                                                            "h-8 w-8 rounded-full transition-all",
                                                                            isDefault ? "text-primary bg-primary/10" : "text-muted-foreground/30 hover:text-primary hover:bg-primary/5"
                                                                        )}
                                                                        onClick={() => handleSetDefault(rate.code)}
                                                                    >
                                                                        <Star className={cn("h-4 w-4", isDefault && "fill-current")} />
                                                                    </Button>
                                                                </TableCell>
                                                                <TableCell className="py-4 px-4">
                                                                    <div className="relative max-w-[140px]">
                                                                        <ArrowRightLeft className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-primary opacity-40" />
                                                                        <Input 
                                                                            type="number" 
                                                                            step="0.0001"
                                                                            defaultValue={rate.rate}
                                                                            onBlur={(e) => handleUpdateRate(rate.code, e.target.value)}
                                                                            className="pl-7 h-8 font-black text-xs border-2 focus-visible:ring-primary/20 bg-background"
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-center">
                                                                    <Badge variant="outline" className="font-black text-[10px] h-6 px-2.5">
                                                                        {mappedVendors.length} Brands
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="py-4 px-4">
                                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                                        <History className="h-3.5 w-3.5" />
                                                                        <span className="text-[10px] font-bold uppercase tracking-tighter">
                                                                            {rate.updatedAt ? formatDistanceToNow(new Date(rate.updatedAt.seconds * 1000), { addSuffix: true }) : 'Sync Pending'}
                                                                        </span>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right py-4 px-8">
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 rounded-lg"
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
                                                                            <div className="bg-background rounded-2xl border-2 shadow-inner overflow-hidden">
                                                                                <div className="p-4 border-b bg-muted/10 flex items-center justify-between">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <Building className="h-4 w-4 text-primary" />
                                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Associated Brands ({rate.code})</span>
                                                                                    </div>
                                                                                    <Select onValueChange={(vId) => handleAssignVendor(vId, rate.code)}>
                                                                                        <SelectTrigger className="h-8 w-[200px] text-[10px] font-bold uppercase border-dashed">
                                                                                            <Plus className="h-3 w-3 mr-1.5" />
                                                                                            <SelectValue placeholder="Map Brand to Currency" />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent>
                                                                                            {vendors?.filter(v => v.currency !== rate.code).map(v => (
                                                                                                <SelectItem key={v.id} value={v.id} className="text-[10px] font-bold uppercase">{v.name}</SelectItem>
                                                                                            ))}
                                                                                        </SelectContent>
                                                                                    </Select>
                                                                                </div>
                                                                                <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                                                    {mappedVendors.length > 0 ? mappedVendors.map(vendor => (
                                                                                        <div key={vendor.id} className="flex items-center justify-between p-3 rounded-xl border-2 bg-muted/5 group/vendor">
                                                                                            <div className="flex items-center gap-3">
                                                                                                <div className="h-8 w-8 bg-white rounded-lg border flex items-center justify-center p-1">
                                                                                                    {vendor.logoUrl ? (
                                                                                                        <img src={vendor.logoUrl} alt={vendor.name} className="h-full w-full object-contain" />
                                                                                                    ) : (
                                                                                                        <Building className="h-4 w-4 text-muted-foreground/40" />
                                                                                                    )}
                                                                                                </div>
                                                                                                <span className="text-[11px] font-black uppercase tracking-tight">{vendor.name}</span>
                                                                                            </div>
                                                                                            <Button 
                                                                                                variant="ghost" 
                                                                                                size="icon" 
                                                                                                className="h-7 w-7 text-muted-foreground opacity-0 group-hover/vendor:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                                                                                                onClick={() => handleAssignVendor(vendor.id, 'AUD')}
                                                                                            >
                                                                                                <Link2 className="h-3.5 w-3.5" />
                                                                                            </Button>
                                                                                        </div>
                                                                                    )) : (
                                                                                        <div className="col-span-full py-8 text-center text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">No brands currently associated with {rate.code}</div>
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
                                    
                                    <div className="mt-8 p-6 rounded-3xl bg-primary/5 border-2 border-primary/10 flex items-start gap-4">
                                        <div className="h-10 w-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 border">
                                            <ShieldCheck className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black uppercase tracking-tight text-primary">Strategic Configuration Note</h4>
                                            <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-2xl mt-1">
                                                The designated default currency represents your organization's local trading base. All master vendor pricing is automatically converted into this base for live building and quotation workflows.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-12">
                                <Coins className="h-20 w-20 text-muted-foreground/10 mb-6" />
                                <h3 className="text-xl font-black uppercase tracking-tight text-muted-foreground/60">No Active Exchange Rates</h3>
                                <p className="text-sm text-muted-foreground max-w-sm mt-2 font-medium">Add major currencies to begin translating master vendor data into your local trading currency.</p>
                                <Button onClick={() => setIsAdding(true)} className="mt-8 h-12 px-8 font-black uppercase tracking-widest rounded-2xl shadow-xl">
                                    Initialize Currency Table
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Add Currency Dialog */}
                <Dialog open={isAdding} onOpenChange={setIsAdding}>
                    <DialogContent className="sm:max-w-md rounded-2xl border-4">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-black uppercase tracking-tight">Add Strategic Currency</DialogTitle>
                            <DialogDescription className="text-xs font-bold uppercase text-muted-foreground/60 tracking-widest">Select a currency to include in your global matrix.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 py-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">1. ISO Currency Code</Label>
                                <Select value={newCode} onValueChange={setNewCode}>
                                    <SelectTrigger className="h-12 font-bold border-2">
                                        <SelectValue placeholder="Select Currency..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableToChoose.map(c => (
                                            <SelectItem key={c.code} value={c.code} className="font-bold">{c.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">2. Initial Exchange Rate</Label>
                                <div className="relative">
                                    <ArrowRightLeft className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                                    <Input 
                                        type="number" 
                                        step="0.0001" 
                                        value={newRate} 
                                        onChange={e => setNewRate(e.target.value)}
                                        className="pl-10 h-12 font-black text-lg border-2 bg-muted/5"
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="gap-3">
                            <Button variant="outline" onClick={() => setIsAdding(false)} className="h-11 px-6 font-bold rounded-xl border-2">Cancel</Button>
                            <Button onClick={handleAddRate} disabled={!newCode} className="h-11 px-8 font-black uppercase tracking-widest rounded-xl shadow-lg">
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Link Currency
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}
