'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp, where, updateDoc, addDoc } from 'firebase/firestore';
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
    ShieldCheck,
    MessageSquare,
    ClipboardList,
    Clock,
    Save
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SUPPORTED_CURRENCIES } from '@/lib/currency-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface ExchangeRate {
    id: string;
    code: string;
    rate: number;
    updatedAt: any;
}

interface ChangeLogEntry {
    id: string;
    rate: number;
    note: string;
    timestamp: any;
    userId?: string;
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
    const { user } = useUser();
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

    // Update Dialog State
    const [isUpdating, setIsUpdating] = useState<ExchangeRate | null>(null);
    const [updateRateVal, setUpdateRateVal] = useState('');
    const [updateNote, setUpdateNote] = useState('');
    const [isProcessingUpdate, setIsProcessingUpdate] = useState(false);

    const handleAddRate = async () => {
        if (!newCode || !newRate) return;
        try {
            const rateRef = doc(firestore, `organisations/${organisationId}/exchangeRates`, newCode);
            await setDoc(rateRef, {
                code: newCode,
                rate: parseFloat(newRate),
                updatedAt: serverTimestamp()
            });
            
            // Initial Log
            await addDoc(collection(rateRef, 'changeLog'), {
                rate: parseFloat(newRate),
                note: "Currency initialized.",
                timestamp: serverTimestamp(),
                userId: user?.uid
            });

            toast({ title: "Exchange Rate Added", description: `1 ${newCode} initialized.` });
            setIsAdding(false);
            setNewCode('');
            setNewRate('1.0');
        } catch (e) {
            toast({ variant: 'destructive', title: "Failed to add rate" });
        }
    };

    const handlePerformUpdate = async () => {
        if (!isUpdating || !updateRateVal || !updateNote.trim()) return;
        setIsProcessingUpdate(true);
        try {
            const rateRef = doc(firestore, `organisations/${organisationId}/exchangeRates`, isUpdating.code);
            const val = parseFloat(updateRateVal);
            
            await updateDoc(rateRef, {
                rate: val,
                updatedAt: serverTimestamp()
            });

            await addDoc(collection(rateRef, 'changeLog'), {
                rate: val,
                note: updateNote,
                timestamp: serverTimestamp(),
                userId: user?.uid
            });

            toast({ title: "Strategic Rate Updated", description: `New rate for ${isUpdating.code} persisted with audit note.` });
            setIsUpdating(null);
            setUpdateRateVal('');
            setUpdateNote('');
        } catch (e) {
            toast({ variant: 'destructive', title: "Update Failed" });
        } finally {
            setIsProcessingUpdate(false);
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
            <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem] border-4 shadow-2xl [&>button]:hidden">
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

                    {/* Content Area */}
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
                                                                    <div 
                                                                        className="relative max-w-[140px] cursor-pointer group/input"
                                                                        onClick={() => {
                                                                            setIsUpdating(rate);
                                                                            setUpdateRateVal(rate.rate.toString());
                                                                        }}
                                                                    >
                                                                        <ArrowRightLeft className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary opacity-40" />
                                                                        <div className="pl-8 pr-3 h-9 flex items-center font-black text-xs border-2 rounded-md bg-background group-hover/input:border-primary/40 transition-all shadow-inner">
                                                                            {rate.rate.toFixed(4)}
                                                                        </div>
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
                                                                            <Tabs defaultValue="brands" className="w-full">
                                                                                <TabsList className="bg-muted/20 h-10 p-1 rounded-2xl border mb-4">
                                                                                    <TabsTrigger value="brands" className="rounded-xl font-black uppercase text-[9px] tracking-widest px-6 h-full data-[state=active]:bg-background data-[state=active]:shadow-md">
                                                                                        <Link2 className="h-3 w-3 mr-2" />
                                                                                        Linked Brands
                                                                                    </TabsTrigger>
                                                                                    <TabsTrigger value="log" className="rounded-xl font-black uppercase text-[9px] tracking-widest px-6 h-full data-[state=active]:bg-background data-[state=active]:shadow-md">
                                                                                        <ClipboardList className="h-3 w-3 mr-2" />
                                                                                        Strategic Audit Log
                                                                                    </TabsTrigger>
                                                                                </TabsList>

                                                                                <TabsContent value="brands">
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
                                                                                </TabsContent>

                                                                                <TabsContent value="log">
                                                                                    <AuditLogView 
                                                                                        organisationId={organisationId} 
                                                                                        currencyCode={rate.code} 
                                                                                    />
                                                                                </TabsContent>
                                                                            </Tabs>
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
                                                The designated default currency represents your organization's local trading base. All master vendor pricing is automatically converted into this base for live building and quotation workflows. Every manual rate adjustment is logged with its associated strategic note for long-term financial auditing.
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

                {/* Update Rate & Note Dialog */}
                <Dialog open={!!isUpdating} onOpenChange={(open) => !open && setIsUpdating(null)}>
                    <DialogContent className="sm:max-w-lg rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                        <DialogHeader className="p-8 border-b bg-muted/5">
                            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Update Strategic Rate: {isUpdating?.code}</DialogTitle>
                            <DialogDescription className="text-[10px] font-black uppercase text-primary tracking-[0.2em] mt-1">Manual Audit Point Creation</DialogDescription>
                        </DialogHeader>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2.5">
                                <Label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70 ml-1">Precision Exchange Rate</Label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 bg-primary/10 rounded-lg flex items-center justify-center">
                                        <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <Input 
                                        type="number" 
                                        step="0.0001" 
                                        value={updateRateVal} 
                                        onChange={e => setUpdateRateVal(e.target.value)}
                                        className="pl-14 h-12 font-black text-lg border-2 rounded-xl bg-muted/5 shadow-inner"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2.5">
                                <Label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70 ml-1">Strategic Audit Note (Mandatory)</Label>
                                <div className="relative">
                                    <MessageSquare className="absolute left-4 top-4 h-4 w-4 text-primary opacity-40" />
                                    <Textarea 
                                        placeholder="Explain the reasoning for this rate adjustment..." 
                                        value={updateNote}
                                        onChange={e => setUpdateNote(e.target.value)}
                                        className="pl-12 min-h-[120px] font-bold text-sm border-2 rounded-xl bg-background shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                            <Button variant="outline" onClick={() => setIsUpdating(null)} className="h-12 px-8 font-black uppercase tracking-widest text-[10px] rounded-2xl border-2 transition-all">Cancel</Button>
                            <Button onClick={handlePerformUpdate} disabled={isProcessingUpdate || !updateRateVal || !updateNote.trim()} className="h-12 px-10 font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl transition-all hover:scale-105">
                                {isProcessingUpdate ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Persist Strategic Change
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}

function AuditLogView({ organisationId, currencyCode }: { organisationId: string, currencyCode: string }) {
    const firestore = useFirestore();
    const logQuery = useMemoFirebase(() => 
        query(collection(firestore, `organisations/${organisationId}/exchangeRates/${currencyCode}/changeLog`), orderBy('timestamp', 'desc')),
    [firestore, organisationId, currencyCode]);
    
    const { data: logs, loading } = useCollection<ChangeLogEntry>(logQuery);

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="bg-background rounded-3xl border-2 shadow-2xl overflow-hidden border-primary/10">
            <div className="p-5 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ClipboardList className="h-4 w-4 text-primary" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Change Log: {currencyCode}</span>
            </div>
            <ScrollArea className="h-[300px]">
                <div className="p-0">
                    {logs && logs.length > 0 ? (
                        <Table>
                            <TableHeader className="bg-muted/5">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="py-3 px-6 font-black uppercase text-[9px] tracking-widest w-[180px]">Timestamp</TableHead>
                                    <TableHead className="py-3 px-6 font-black uppercase text-[9px] tracking-widest w-[120px]">Precision Rate</TableHead>
                                    <TableHead className="py-3 px-6 font-black uppercase text-[9px] tracking-widest">Audit Note</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map((log) => (
                                    <TableRow key={log.id} className="hover:bg-muted/10 border-b">
                                        <TableCell className="py-4 px-6 align-top">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <Clock className="h-3 w-3 opacity-40" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">
                                                    {log.timestamp ? formatDistanceToNow(new Date(log.timestamp.seconds * 1000), { addSuffix: true }) : 'Just now'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 px-6 align-top">
                                            <Badge variant="secondary" className="font-mono font-black text-xs h-7 px-3 bg-primary/5 border-primary/10 text-primary">
                                                {log.rate.toFixed(4)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-4 px-6 align-top">
                                            <p className="text-[11px] font-bold text-foreground leading-relaxed">
                                                {log.note}
                                            </p>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="py-20 text-center flex flex-col items-center gap-3 opacity-20">
                            <History className="h-8 w-8" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No strategic changes logged for this currency.</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
