'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, setDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
    Loader2, 
    Search, 
    Plus, 
    Trash2, 
    DollarSign,
    Percent
} from 'lucide-react';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { 
    Dialog, 
    DialogContent, 
    DialogDescription, 
    DialogFooter, 
    DialogHeader, 
    DialogTitle,
    DialogClose 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/currency-utils';
import { useToast } from '@/hooks/use-toast';

interface Brand {
    id: string;
    name: string;
    description?: string;
}

interface Product {
    id: string;
    brandId: string;
    name: string;
    sku: string;
    description?: string;
}

interface PriceLevelDefinition {
    id: string;
    organisationId: string;
    name: string;
    calculationMethod: 'manual' | 'percentageOfBase';
    percentageModifier?: number;
    basePriceSource?: 'supplierCost' | 'costPlusMargin' | 'totalCostIncludingCustoms';
    isSubDealerPriceLevel: boolean;
}

interface ProductPrice {
    id: string;
    organisationId: string;
    productId: string;
    brandId: string;
    supplierCost: number;
    supplierCostCurrency: string;
    exchangeRateToBaseCurrency: number;
    baseMarginPercentage: number;
    customCostings: Record<string, number>;
    lastUpdated: any;
}

export function PriceBookTable({ organisation }: { organisation: any }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [selectedBrandId, setSelectedBrandId] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddLevelOpen, setIsAddLevelOpen] = useState(false);

    // level form state
    const [newLevelName, setNewLevelName] = useState('');
    const [newLevelMethod, setNewLevelMethod] = useState<'manual' | 'percentageOfBase'>('manual');
    const [newLevelPercent, setNewLevelPercent] = useState<number>(100);
    const [newLevelSource, setNewLevelBaseSource] = useState<PriceLevelDefinition['basePriceSource']>('costPlusMargin');

    // Subscriptions & Brands
    const brandsQuery = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
    const { data: allBrands } = useCollection<Brand>(brandsQuery);
    
    const subscribedBrandIds = organisation.dataWarehouseSubscriptions || [];
    const brands = useMemo(() => 
        allBrands?.filter(b => subscribedBrandIds.includes(b.id)) || [], 
    [allBrands, subscribedBrandIds]);

    // Products
    const productsQuery = useMemoFirebase(() => {
        if (selectedBrandId === 'all') {
            if (subscribedBrandIds.length === 0) return null;
            return query(collection(firestore, 'products'), where('brandId', 'in', subscribedBrandIds));
        }
        return query(collection(firestore, 'products'), where('brandId', '==', selectedBrandId));
    }, [firestore, selectedBrandId, subscribedBrandIds]);
    const { data: products, loading: productsLoading } = useCollection<Product>(productsQuery);

    // Org Price Definitions
    const levelsQuery = useMemoFirebase(() => 
        query(collection(firestore, `organisations/${organisation.id}/priceLevelDefinitions`)),
    [firestore, organisation.id]);
    const { data: levelDefinitions } = useCollection<PriceLevelDefinition>(levelsQuery);

    // Org Product Pricing
    const productPricesQuery = useMemoFirebase(() => 
        query(collection(firestore, `organisations/${organisation.id}/productPrices`)),
    [firestore, organisation.id]);
    const { data: productPrices } = useCollection<ProductPrice>(productPricesQuery);

    const pricesByProductId = useMemo(() => {
        if (!productPrices) return new Map<string, ProductPrice>();
        return new Map(productPrices.map(p => [p.productId, p]));
    }, [productPrices]);

    // Ensure Sub Dealer Price Level exists if needed
    useEffect(() => {
        if (organisation.subDealersEnabled && levelDefinitions && levelDefinitions.length > 0) {
            const hasSubDealerLevel = levelDefinitions.some(l => l.isSubDealerPriceLevel);
            if (!hasSubDealerLevel) {
                const levelsRef = collection(firestore, `organisations/${organisation.id}/priceLevelDefinitions`);
                addDoc(levelsRef, {
                    organisationId: organisation.id,
                    name: 'Sub Dealer Price',
                    calculationMethod: 'percentageOfBase',
                    percentageModifier: 1.10,
                    basePriceSource: 'costPlusMargin',
                    isSubDealerPriceLevel: true
                });
            }
        }
    }, [organisation, levelDefinitions, firestore]);

    const handleCreateLevel = async () => {
        if (!newLevelName.trim()) return;
        try {
            const levelsRef = collection(firestore, `organisations/${organisation.id}/priceLevelDefinitions`);
            await addDoc(levelsRef, {
                organisationId: organisation.id,
                name: newLevelName,
                calculationMethod: newLevelMethod,
                percentageModifier: newLevelMethod === 'percentageOfBase' ? newLevelPercent / 100 : null,
                basePriceSource: newLevelMethod === 'percentageOfBase' ? newLevelSource : null,
                isSubDealerPriceLevel: false
            });
            toast({ title: "Price Level Created" });
            setIsAddLevelOpen(false);
            setNewLevelName('');
        } catch (e) {
            toast({ variant: 'destructive', title: "Failed to create price level" });
        }
    };

    const handleDeleteLevel = async (id: string) => {
        try {
            await deleteDoc(doc(firestore, `organisations/${organisation.id}/priceLevelDefinitions`, id));
            toast({ title: "Price Level Deleted" });
        } catch (e) {
            toast({ variant: 'destructive', title: "Delete Failed" });
        }
    };

    const updateProductCost = async (productId: string, brandId: string, cost: string) => {
        const num = parseFloat(cost);
        const existingPrice = pricesByProductId.get(productId);
        const docRef = existingPrice 
            ? doc(firestore, `organisations/${organisation.id}/productPrices`, existingPrice.id)
            : doc(collection(firestore, `organisations/${organisation.id}/productPrices`));

        const sourceCurrency = organisation.tradingCurrency || 'AUD';

        await setDoc(docRef, {
            organisationId: organisation.id,
            productId,
            brandId,
            supplierCost: isNaN(num) ? 0 : num,
            supplierCostCurrency: sourceCurrency,
            exchangeRateToBaseCurrency: 1, 
            baseMarginPercentage: existingPrice?.baseMarginPercentage || 0,
            customCostings: existingPrice?.customCostings || {},
            lastUpdated: serverTimestamp()
        }, { merge: true });
    };

    const updateProductMargin = async (productId: string, brandId: string, margin: string) => {
        const num = parseFloat(margin);
        const existingPrice = pricesByProductId.get(productId);
        if (!existingPrice) return;

        const docRef = doc(firestore, `organisations/${organisation.id}/productPrices`, existingPrice.id);
        await setDoc(docRef, {
            baseMarginPercentage: isNaN(num) ? 0 : num,
            lastUpdated: serverTimestamp()
        }, { merge: true });
    };

    const filteredProducts = useMemo(() => {
        if (!products) return [];
        const lower = searchTerm.toLowerCase();
        return products.filter(p => 
            p.name.toLowerCase().includes(lower) || 
            p.sku.toLowerCase().includes(lower)
        );
    }, [products, searchTerm]);

    if (productsLoading) {
        return <div className="flex justify-center p-24"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-6 max-w-full overflow-hidden min-w-0">
            <Card className="max-w-full overflow-hidden min-w-0">
                <CardHeader className="shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Master Price Book</CardTitle>
                            <CardDescription>Manage all product pricing across your subscribed brands.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={() => setIsAddLevelOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Add Price Level
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 max-w-full overflow-hidden min-w-0 flex flex-col">
                    <div className="flex flex-col md:flex-row gap-4 shrink-0">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search SKU or Product Name..." 
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                            <SelectTrigger className="w-full md:w-[240px]">
                                <SelectValue placeholder="All Brands" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Subscribed Brands</SelectItem>
                                {brands.map(b => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="rounded-md border overflow-hidden max-w-full min-w-0">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-[200px] whitespace-nowrap px-4">Product / SKU</TableHead>
                                    <TableHead className="text-right whitespace-nowrap px-4">Supplier Cost</TableHead>
                                    <TableHead className="text-right whitespace-nowrap px-4">Margin (%)</TableHead>
                                    <TableHead className="text-right font-bold whitespace-nowrap px-4">Base Price</TableHead>
                                    {levelDefinitions?.map(level => (
                                        <TableHead key={level.id} className="text-right bg-primary/5 group min-w-[150px] px-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="whitespace-nowrap">{level.name}</span>
                                                {!level.isSubDealerPriceLevel && (
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => handleDeleteLevel(level.id)}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredProducts.length > 0 ? filteredProducts.map(product => {
                                    const price = pricesByProductId.get(product.id);
                                    const cost = price?.supplierCost || 0;
                                    const margin = price?.baseMarginPercentage || 0;
                                    const basePrice = margin < 100 ? cost / (1 - (margin / 100)) : cost;

                                    return (
                                        <TableRow key={product.id} className="hover:bg-muted/20">
                                            <TableCell className="px-4">
                                                <div className="flex flex-col min-w-[180px]">
                                                    <span className="font-bold text-sm truncate">{product.name}</span>
                                                    <span className="text-[10px] font-mono text-muted-foreground uppercase">{product.sku}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="p-2 px-4">
                                                <div className="relative w-28 ml-auto">
                                                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                                    <Input 
                                                        type="number"
                                                        defaultValue={price?.supplierCost ?? ''}
                                                        onBlur={(e) => updateProductCost(product.id, product.brandId, e.target.value)}
                                                        className="h-8 text-right pl-6 text-xs"
                                                    />
                                                </div>
                                            </TableCell>
                                            <TableCell className="p-2 px-4">
                                                <div className="relative w-20 ml-auto">
                                                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                                    <Input 
                                                        type="number"
                                                        defaultValue={price?.baseMarginPercentage ?? ''}
                                                        onBlur={(e) => updateProductMargin(product.id, product.brandId, e.target.value)}
                                                        className="h-8 text-center pr-6 text-xs"
                                                    />
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-black text-primary text-xs whitespace-nowrap px-4">
                                                {formatCurrency(basePrice, organisation.tradingCurrency || 'AUD')}
                                            </TableCell>
                                            {levelDefinitions?.map(level => {
                                                let calculatedValue = 0;
                                                if (level.calculationMethod === 'percentageOfBase') {
                                                    const baseSource = level.basePriceSource === 'supplierCost' ? cost : basePrice;
                                                    calculatedValue = baseSource * (level.percentageModifier || 1);
                                                }

                                                return (
                                                    <TableCell key={level.id} className="text-right font-bold bg-primary/5 text-xs whitespace-nowrap px-4">
                                                        {calculatedValue > 0 ? formatCurrency(calculatedValue, organisation.tradingCurrency || 'AUD') : '-'}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    );
                                }) : (
                                    <TableRow>
                                        <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                                            {productsLoading ? "Loading products..." : "No products found for this selection."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isAddLevelOpen} onOpenChange={setIsAddLevelOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Price Level</DialogTitle>
                        <DialogDescription>Add a new pricing tier to your book. This will appear as a column in the table.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Level Name</Label>
                            <Input placeholder="e.g. Wholesale Tier 1" value={newLevelName} onChange={e => setNewLevelName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Calculation Method</Label>
                            <Select value={newLevelMethod} onValueChange={(v: any) => setNewLevelMethod(v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="manual">Manual Entry</SelectItem>
                                    <SelectItem value="percentageOfBase">Percentage of Base</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {newLevelMethod === 'percentageOfBase' && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Percentage (%)</Label>
                                        <Input type="number" value={newLevelPercent} onChange={e => setNewLevelPercent(parseFloat(e.target.value))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Base Source</Label>
                                        <Select value={newLevelSource} onValueChange={(v: any) => setNewLevelBaseSource(v)}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="supplierCost">Supplier Cost</SelectItem>
                                                <SelectItem value="costPlusMargin">Cost + Margin (Base Price)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground italic">
                                    Formula: {newLevelSource === 'supplierCost' ? 'Supplier Cost' : 'Base Price'} x {newLevelPercent}%
                                </p>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleCreateLevel} disabled={!newLevelName.trim()}>Create Level</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
