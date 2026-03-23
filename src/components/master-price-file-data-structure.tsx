'use client';

import { useState, useMemo, useCallback } from 'react';
import { useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, doc, writeBatch, setDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
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
import {
    Loader2,
    UploadCloud,
    Search,
    ChevronRight,
    Anchor,
    Settings2,
    Package,
    Wrench,
    Trash2,
    FileSpreadsheet,
    CheckCircle2,
    AlertCircle,
    Filter,
    X,
} from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────

interface MotorRecord {
    id: string;
    modelFull: string;
    model: string;
    hpRating: string;
    shaftLength: string;
    cylinders: string;
    engineColour: string;
    imageLink: string;
    control: string;
    starting: string;
    tiltTrim: string;
    fuelTank: string;
    propType: string;
    salesInstall: string;
    supplier: string;
    retailPricing: {
        dealerListPrice: number | null;
        storePrice: number | null;
        dealerBuy: number | null;
        freightExcGst: number | null;
        landedCtd: number | null;
        nettCtd: number | null;
        [key: string]: any;
    };
    sellPricing: {
        sellPrice: number | null;
        [key: string]: any;
    };
    tradePricing: {
        tradePrice: number | null;
        [key: string]: any;
    };
    commercialPricing: {
        commercialPrice: number | null;
        [key: string]: any;
    };
    installation: Record<string, any>;
    riggingOptions: string[];
    propOptions: string[];
    additionalFactoryOptions: string[];
    masterAccessories?: any[];
    [key: string]: any;
}

// ─── Spreadsheet Parser ───────────────────────────────────────────

function safeFloat(val: any): number | null {
    if (val == null || val === '' || val === '.') return null;
    const cleaned = String(val).replace(/[$,%]/g, '').trim();
    if (cleaned === '' || cleaned === '.') return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

function safeStr(val: any): string {
    if (val == null) return '';
    const s = String(val).trim();
    return s === '.' ? '' : s;
}

function parseMotorLibrarySheet(worksheet: XLSX.WorkSheet): MotorRecord[] {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const motors: MotorRecord[] = [];

    // Helper to read a cell value
    const cellVal = (r: number, c: number): any => {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[addr];
        return cell ? cell.v : undefined;
    };

    // Find header row (row 4, 0-indexed row 3)
    // Dynamically find rigging/prop/FO columns from headers
    const headerRow = 3;
    const maxCol = range.e.c;

    const riggingCols: number[] = [];
    const propCols: number[] = [];
    const additionalFoCols: number[] = [];

    for (let c = 0; c <= maxCol; c++) {
        const h = safeStr(cellVal(headerRow, c));
        if (h.startsWith('Rigging Option')) riggingCols.push(c);
        else if (h.startsWith('Prop Option')) propCols.push(c);
        else if (h.startsWith("Additional FO")) additionalFoCols.push(c);
    }

    // Parse motor rows (row 5 onwards, 0-indexed row 4+)
    for (let r = 4; r <= range.e.r; r++) {
        const modelFull = safeStr(cellVal(r, 0));
        if (!modelFull || !modelFull.startsWith('Yamaha - ')) continue;

        const col = (c: number) => cellVal(r, c);

        const motor: MotorRecord = {
            id: '', // will be set later
            modelFull,
            model: safeStr(col(1)),
            hpRating: safeStr(col(2)),
            shaftLength: safeStr(col(3)),
            cylinders: safeStr(col(4)),
            engineColour: safeStr(col(5)),
            imageLink: safeStr(col(6)),
            control: safeStr(col(7)),
            starting: safeStr(col(8)),
            tiltTrim: safeStr(col(9)),
            fuelTank: safeStr(col(11)),
            propType: safeStr(col(12)),
            salesInstall: safeStr(col(13)),
            supplier: safeStr(col(14)),
            retailPricing: {
                dealerListPrice: safeFloat(col(15)),
                holdback: safeFloat(col(16)),
                storePrice: safeFloat(col(17)),
                digs: safeFloat(col(18)),
                dealerBuy: safeFloat(col(19)),
                freightExcGst: safeFloat(col(20)),
                landedCtd: safeFloat(col(21)),
                rebateProgram: safeStr(col(22)),
                rebateDiscount: safeFloat(col(23)),
                nettCtd: safeFloat(col(24)),
            },
            sellPricing: {
                rrpFreightIncGst: safeFloat(col(51)),
                nsmRetail: safeFloat(col(52)),
                factoryRebate: safeFloat(col(53)),
                dealerDiscount: safeFloat(col(54)),
                sellPrice: safeFloat(col(55)),
            },
            tradePricing: {
                tradeMu: safeFloat(col(57)),
                tradeGp: safeFloat(col(58)),
                tradeFactoryRebate: safeFloat(col(59)),
                tradeDiscount: safeFloat(col(60)),
                tradePrice: safeFloat(col(61)),
            },
            commercialPricing: {
                commercial: safeFloat(col(64)),
                commercialGp: safeFloat(col(65)),
                commercialRebate: safeFloat(col(66)),
                commercialDiscount: safeFloat(col(67)),
                commercialPrice: safeFloat(col(68)),
            },
            installation: {
                opCode: safeStr(col(85)),
                ttf: safeFloat(col(86)),
                labour: safeFloat(col(87)),
                sundry1: safeFloat(col(88)),
                sundry2: safeFloat(col(89)),
                sundry3: safeFloat(col(90)),
                sublet: safeFloat(col(91)),
                installCtd: safeFloat(col(92)),
                installSell: safeFloat(col(93)),
            },
            riggingOptions: [],
            propOptions: [],
            additionalFactoryOptions: [],
        };

        // Rigging options
        for (const ri of riggingCols) {
            const val = safeStr(col(ri));
            if (val && val !== '.') motor.riggingOptions.push(val);
        }

        // Prop options
        for (const pi of propCols) {
            const val = safeStr(col(pi));
            if (val && val !== '.') motor.propOptions.push(val);
        }

        // Additional FOs
        for (const fi of additionalFoCols) {
            const val = safeStr(col(fi));
            if (val && val !== '0' && val !== '.') motor.additionalFactoryOptions.push(val);
        }

        motors.push(motor);
    }

    return motors;
}

// ─── Formatter Helpers ────────────────────────────────────────────

const formatCurrency = (val: number | null | undefined) => {
    if (val == null) return '-';
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
};

// ─── Motor Detail Dialog ──────────────────────────────────────────

function MotorDetailDialog({ motor, isOpen, onClose }: { motor: MotorRecord | null; isOpen: boolean; onClose: () => void }) {
    if (!motor) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b bg-muted/20">
                    <DialogTitle className="text-xl font-bold">{motor.modelFull}</DialogTitle>
                    <DialogDescription>
                        {motor.hpRating} HP | {motor.shaftLength} Shaft | {motor.control} | {motor.starting}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    <div className="p-6 space-y-6">
                        {/* Core Specs */}
                        <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Specifications</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    ['HP Rating', motor.hpRating],
                                    ['Shaft', motor.shaftLength],
                                    ['Cylinders', motor.cylinders],
                                    ['Control', motor.control],
                                    ['Starting', motor.starting],
                                    ['Tilt & Trim', motor.tiltTrim],
                                    ['Fuel Tank', motor.fuelTank],
                                    ['Colour', motor.engineColour],
                                ].map(([label, value]) => (
                                    <div key={label} className="p-2 rounded-md bg-muted/30 border">
                                        <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
                                        <div className="text-sm font-semibold">{value || '-'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pricing Tiers */}
                        <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Pricing</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="p-3 rounded-md border bg-green-50 dark:bg-green-950/20">
                                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Sell Price</div>
                                    <div className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(motor.sellPricing?.sellPrice)}</div>
                                </div>
                                <div className="p-3 rounded-md border bg-blue-50 dark:bg-blue-950/20">
                                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Trade Price</div>
                                    <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{formatCurrency(motor.tradePricing?.tradePrice)}</div>
                                </div>
                                <div className="p-3 rounded-md border bg-orange-50 dark:bg-orange-950/20">
                                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Commercial</div>
                                    <div className="text-lg font-bold text-orange-700 dark:text-orange-400">{formatCurrency(motor.commercialPricing?.commercialPrice)}</div>
                                </div>
                                <div className="p-3 rounded-md border">
                                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Nett CTD</div>
                                    <div className="text-lg font-bold">{formatCurrency(motor.retailPricing?.nettCtd)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Rigging Options */}
                        {motor.riggingOptions.length > 0 && (
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                    <Wrench className="h-3 w-3" />
                                    Compatible Rigging ({motor.riggingOptions.length})
                                </h4>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {motor.riggingOptions.map((rig, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-sm">
                                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                            {rig}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Prop Options */}
                        {motor.propOptions.length > 0 && (
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                    <Anchor className="h-3 w-3" />
                                    Compatible Propellers ({motor.propOptions.length})
                                </h4>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {motor.propOptions.map((prop, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-sm">
                                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                            {prop}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Additional Factory Options */}
                        {motor.additionalFactoryOptions.length > 0 && (
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                    <Package className="h-3 w-3" />
                                    Additional Factory Options ({motor.additionalFactoryOptions.length})
                                </h4>
                                <div className="space-y-1">
                                    {motor.additionalFactoryOptions.map((fo, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-sm">
                                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                            {fo}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Installation */}
                        <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                <Settings2 className="h-3 w-3" />
                                Installation
                            </h4>
                            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                                {[
                                    ['Op Code', motor.installation?.opCode],
                                    ['TTF', motor.installation?.ttf],
                                    ['Labour', formatCurrency(motor.installation?.labour)],
                                    ['Install CTD', formatCurrency(motor.installation?.installCtd)],
                                    ['Install Sell', formatCurrency(motor.installation?.installSell)],
                                ].map(([label, value]) => (
                                    <div key={label as string} className="p-2 rounded-md bg-muted/30 border">
                                        <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
                                        <div className="text-sm font-semibold">{value || '-'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

// ─── Upload Component ─────────────────────────────────────────────

function MasterPriceFileUploader({ vendorId }: { vendorId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState<{ total: number; imported: number } | null>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setProgress(0);
        setStats(null);

        try {
            // Read the Excel file
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            // Find the Motor Library sheet
            const motorLibrarySheet = workbook.SheetNames.find(
                name => name.toLowerCase().includes('motor library') || name.toLowerCase().includes('motor_library')
            );

            if (!motorLibrarySheet) {
                toast({
                    variant: 'destructive',
                    title: 'Sheet Not Found',
                    description: `Could not find a "Motor Library" sheet. Available sheets: ${workbook.SheetNames.join(', ')}`,
                });
                return;
            }

            const worksheet = workbook.Sheets[motorLibrarySheet];
            const motors = parseMotorLibrarySheet(worksheet);

            if (motors.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'No Motors Found',
                    description: 'The Motor Library sheet did not contain any valid motor records.',
                });
                return;
            }

            // Upload to Firestore in batches (500 per batch is the Firestore limit)
            const BATCH_SIZE = 400;
            let imported = 0;

            for (let i = 0; i < motors.length; i += BATCH_SIZE) {
                const batch = writeBatch(firestore);
                const chunk = motors.slice(i, i + BATCH_SIZE);

                for (const motor of chunk) {
                    const slug = (motor.model || motor.modelFull.replace('Yamaha - ', ''))
                        .toLowerCase()
                        .replace(/[\s()]/g, '-')
                        .replace(/-+/g, '-');
                    const docRef = doc(firestore, `data-warehouse/${vendorId}/masterDataSet`, slug);
                    batch.set(docRef, {
                        ...motor,
                        id: slug,
                        importedAt: serverTimestamp(),
                        'Model Name': motor.modelFull,
                        'HP Rating': motor.hpRating,
                        SummaryImage: motor.imageLink,
                        sellPriceExclGst: motor.sellPricing?.sellPrice ?? null,
                        cost: motor.retailPricing?.nettCtd ?? null,
                    });
                }

                await batch.commit();
                imported += chunk.length;
                setProgress(Math.round((imported / motors.length) * 100));
            }

            setStats({ total: motors.length, imported });
            toast({
                title: 'Import Complete',
                description: `Successfully imported ${motors.length} motors with rigging, props, and pricing data.`,
            });
        } catch (error: any) {
            console.error('Import failed:', error);
            toast({
                variant: 'destructive',
                title: 'Import Failed',
                description: error.message || 'An unexpected error occurred during import.',
            });
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <UploadCloud className="h-5 w-5" />
                    Import Motor Library
                </CardTitle>
                <CardDescription>
                    Upload the Motor Module Excel file (.xlsx) to import motors with their compatible rigging kits, propellers, pricing tiers, and installation data.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                    <label className={cn(
                        "flex items-center justify-center gap-2 px-6 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                        isUploading ? "opacity-50 cursor-not-allowed" : "hover:bg-accent hover:border-primary"
                    )}>
                        {isUploading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <FileSpreadsheet className="h-5 w-5" />
                        )}
                        <span className="text-sm font-bold">
                            {isUploading ? 'Importing...' : 'Select Motor Module .xlsx'}
                        </span>
                        <Input
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                        />
                    </label>
                </div>

                {isUploading && (
                    <div className="space-y-2">
                        <Progress value={progress} />
                        <p className="text-xs text-muted-foreground">{progress}% complete</p>
                    </div>
                )}

                {stats && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                            Imported {stats.imported} of {stats.total} motors successfully
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Main Component ───────────────────────────────────────────────

export function MasterPriceFileDataStructure({ vendorId, vendorSlugOrId }: { vendorId: string; vendorSlugOrId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    // Fetch all motors from masterDataSet
    const motorsQuery = useMemoFirebase(() => {
        if (!vendorId) return null;
        return query(collection(firestore, `data-warehouse/${vendorId}/masterDataSet`));
    }, [firestore, vendorId]);
    const { data: rawMotors, loading: motorsLoading } = useCollection<MotorRecord>(motorsQuery);

    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [hpFilter, setHpFilter] = useState<string>('all');
    const [selectedMotor, setSelectedMotor] = useState<MotorRecord | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    // Derived data
    const motors = useMemo(() => rawMotors || [], [rawMotors]);

    const hpOptions = useMemo(() => {
        const hps = new Set<string>();
        motors.forEach(m => {
            if (m.hpRating) hps.add(m.hpRating);
        });
        return Array.from(hps).sort((a, b) => {
            const na = parseFloat(a);
            const nb = parseFloat(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b);
        });
    }, [motors]);

    const filteredMotors = useMemo(() => {
        return motors.filter(m => {
            const matchesSearch = !searchTerm ||
                m.modelFull?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                m.model?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesHp = hpFilter === 'all' || m.hpRating === hpFilter;
            return matchesSearch && matchesHp;
        });
    }, [motors, searchTerm, hpFilter]);

    const stats = useMemo(() => ({
        total: motors.length,
        withRigging: motors.filter(m => m.riggingOptions?.length > 0).length,
        withProps: motors.filter(m => m.propOptions?.length > 0).length,
        withPricing: motors.filter(m => m.sellPricing?.sellPrice != null).length,
    }), [motors]);

    const handleClearAll = async () => {
        setIsClearing(true);
        try {
            const BATCH_SIZE = 400;
            for (let i = 0; i < motors.length; i += BATCH_SIZE) {
                const batch = writeBatch(firestore);
                const chunk = motors.slice(i, i + BATCH_SIZE);
                for (const motor of chunk) {
                    batch.delete(doc(firestore, `data-warehouse/${vendorId}/masterDataSet`, motor.id));
                }
                await batch.commit();
            }
            toast({ title: 'Data Cleared', description: 'All motor records have been removed.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Clear Failed', description: error.message });
        } finally {
            setIsClearing(false);
            setIsClearDialogOpen(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-md bg-primary/10">
                            <Settings2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{stats.total}</div>
                            <div className="text-xs text-muted-foreground">Total Motors</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-md bg-blue-500/10">
                            <Wrench className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{stats.withRigging}</div>
                            <div className="text-xs text-muted-foreground">With Rigging</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-md bg-green-500/10">
                            <Anchor className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{stats.withProps}</div>
                            <div className="text-xs text-muted-foreground">With Props</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-md bg-orange-500/10">
                            <Package className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{stats.withPricing}</div>
                            <div className="text-xs text-muted-foreground">With Pricing</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Upload / Import */}
            <MasterPriceFileUploader vendorId={vendorId} />

            {/* Motor Library Browser */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Motor Library</CardTitle>
                            <CardDescription>
                                Browse motors with their compatible rigging kits, propellers, and pricing. Click any motor to see full details.
                            </CardDescription>
                        </div>
                        {motors.length > 0 && (
                            <Button variant="destructive" size="sm" onClick={() => setIsClearDialogOpen(true)}>
                                <Trash2 className="h-3 w-3 mr-1" />
                                Clear All
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search & Filter */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search motors by model..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                            {searchTerm && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                                    onClick={() => setSearchTerm('')}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                        <Select value={hpFilter} onValueChange={setHpFilter}>
                            <SelectTrigger className="w-[180px]">
                                <Filter className="h-3 w-3 mr-2" />
                                <SelectValue placeholder="Filter by HP" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All HP Ratings</SelectItem>
                                {hpOptions.map(hp => (
                                    <SelectItem key={hp} value={hp}>{hp} HP</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Results */}
                    {motorsLoading ? (
                        <div className="flex justify-center items-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : motors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <FileSpreadsheet className="h-12 w-12 mb-4 opacity-20" />
                            <p className="font-semibold">No motors imported yet</p>
                            <p className="text-sm mt-1">Upload the Motor Module spreadsheet above to populate the library.</p>
                        </div>
                    ) : filteredMotors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mb-3 opacity-30" />
                            <p className="text-sm">No motors match your filters</p>
                        </div>
                    ) : (
                        <ScrollArea className="max-h-[600px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[280px]">Motor</TableHead>
                                        <TableHead className="text-center">HP</TableHead>
                                        <TableHead className="text-center">Shaft</TableHead>
                                        <TableHead className="text-center">Rigging</TableHead>
                                        <TableHead className="text-center">Props</TableHead>
                                        <TableHead className="text-right">Sell Price</TableHead>
                                        <TableHead className="text-right">Trade</TableHead>
                                        <TableHead className="text-right">Nett CTD</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredMotors.map((motor) => (
                                        <TableRow
                                            key={motor.id}
                                            className="cursor-pointer hover:bg-primary/5"
                                            onClick={() => {
                                                setSelectedMotor(motor);
                                                setIsDetailOpen(true);
                                            }}
                                        >
                                            <TableCell>
                                                <div className="font-semibold text-sm">{motor.model || motor.modelFull}</div>
                                                <div className="text-xs text-muted-foreground">{motor.control} | {motor.starting}</div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="secondary" className="font-mono">{motor.hpRating}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center text-sm">{motor.shaftLength}</TableCell>
                                            <TableCell className="text-center">
                                                {(motor.riggingOptions?.length ?? 0) > 0 ? (
                                                    <Badge variant="outline" className="text-blue-600">
                                                        <Wrench className="h-3 w-3 mr-1" />
                                                        {motor.riggingOptions.length}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {(motor.propOptions?.length ?? 0) > 0 ? (
                                                    <Badge variant="outline" className="text-green-600">
                                                        <Anchor className="h-3 w-3 mr-1" />
                                                        {motor.propOptions.length}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm font-semibold text-green-700 dark:text-green-400">
                                                {formatCurrency(motor.sellPricing?.sellPrice)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatCurrency(motor.tradePricing?.tradePrice)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatCurrency(motor.retailPricing?.nettCtd)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    )}

                    {filteredMotors.length > 0 && (
                        <div className="text-xs text-muted-foreground text-right">
                            Showing {filteredMotors.length} of {motors.length} motors
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Motor Detail Dialog */}
            <MotorDetailDialog
                motor={selectedMotor}
                isOpen={isDetailOpen}
                onClose={() => {
                    setIsDetailOpen(false);
                    setSelectedMotor(null);
                }}
            />

            {/* Clear All Confirmation */}
            <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear All Motor Data?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all {motors.length} motor records from the Master Price File. This cannot be undone. You can re-import from the spreadsheet afterwards.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleClearAll}
                            className="bg-destructive hover:bg-destructive/90"
                            disabled={isClearing}
                        >
                            {isClearing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Yes, clear all data
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
