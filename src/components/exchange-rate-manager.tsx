
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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
    RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SUPPORTED_CURRENCIES } from '@/lib/currency-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

interface ExchangeRate {
    id: string;
    code: string;
    rate: number;
    updatedAt: any;
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
    
    const ratesQuery = useMemoFirebase(() => 
        query(collection(firestore, `organisations/${organisationId}/exchangeRates`), orderBy('code')),
    [firestore, organisationId]);
    
    const { data: rates, loading } = useCollection<ExchangeRate>(ratesQuery);

    const [isAdding, setIsAdding] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [newRate, setNewRate] = useState('1.0');

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

    const handleDeleteRate = async (code: string) => {
        try {
            await deleteDoc(doc(firestore, `organisations/${organisationId}/exchangeRates`, code));
            toast({ title: "Rate Removed" });
        } catch (e) {
            toast({ variant: 'destructive', title: "Delete Failed" });
        }
    };

    const availableToChoose = useMemo(() => {
        const activeCodes = (rates || []).map(r => r.code);
        return SUPPORTED_CURRENCIES.filter(c => !activeCodes.includes(c.code));
    }, [rates]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw] w-[1000px] h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border-4 shadow-2xl [&>button]:hidden">
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
                                                    <TableHead className="w-[200px] py-5 px-8 font-black uppercase text-[10px] tracking-widest">ISO Code</TableHead>
                                                    <TableHead className="w-[300px] py-5 px-8 font-black uppercase text-[10px] tracking-widest">Manual Rate (Relative to Base)</TableHead>
                                                    <TableHead className="py-5 px-8 font-black uppercase text-[10px] tracking-widest">Last Precision Sync</TableHead>
                                                    <TableHead className="text-right py-5 px-8 font-black uppercase text-[10px] tracking-widest">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {rates.map((rate) => (
                                                    <TableRow key={rate.code} className="hover:bg-primary/5 transition-colors group">
                                                        <TableCell className="py-4 px-8">
                                                            <div className="flex items-center gap-3">
                                                                <Badge className="font-black text-xs h-8 w-14 justify-center bg-primary text-primary-foreground shadow-md">
                                                                    {rate.code}
                                                                </Badge>
                                                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                                                    {SUPPORTED_CURRENCIES.find(c => c.code === rate.code)?.label.split('(')[0]}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-4 px-8">
                                                            <div className="relative max-w-[180px]">
                                                                <ArrowRightLeft className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary opacity-40" />
                                                                <Input 
                                                                    type="number" 
                                                                    step="0.0001"
                                                                    defaultValue={rate.rate}
                                                                    onBlur={(e) => handleUpdateRate(rate.code, e.target.value)}
                                                                    className="pl-10 h-10 font-black text-sm border-2 focus-visible:ring-primary/20 bg-muted/5"
                                                                />
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-4 px-8">
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
                                                                className="h-9 w-9 text-destructive opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 rounded-xl"
                                                                onClick={() => handleDeleteRate(rate.code)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    
                                    <div className="mt-8 p-6 rounded-3xl bg-primary/5 border-2 border-primary/10 flex items-start gap-4">
                                        <div className="h-10 w-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 border">
                                            <RefreshCw className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black uppercase tracking-tight text-primary">Strategic Override Note</h4>
                                            <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-2xl mt-1">
                                                These rates are utilized system-wide for all price translations. Ensure precision when updating rates as changes impact live quote calculations and warehouse master datasets.
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
