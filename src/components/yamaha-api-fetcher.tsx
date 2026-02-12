'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, TestTube2, Save } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { proxyFetch } from '@/actions/proxy-fetch';
import { JsonDataVisualizer } from './json-data-visualizer';
import { Progress } from './ui/progress';
import { useFirestore } from '@/firebase/provider';
import { collection, doc, getDocs, query, writeBatch } from 'firebase/firestore';

export function YamahaApiFetcher({ vendorId }: { vendorId: string }) {
    const [masterUrl, setMasterUrl] = useState('');
    const [detailUrlPrefix, setDetailUrlPrefix] = useState('');
    const [pricingUrl, setPricingUrl] = useState('');
    const [masterData, setMasterData] = useState<any[] | null>(null);
    const [detailedData, setDetailedData] = useState<any[] | null>(null);
    const [pricingData, setPricingData] = useState<any[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const { toast } = useToast();
    const firestore = useFirestore();

    const handleFetchData = async () => {
        if (!masterUrl || !detailUrlPrefix || !pricingUrl) {
            setError("Please enter all three API URLs.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setMasterData(null);
        setDetailedData(null);
        setPricingData(null);
        setProgress(0);

        try {
            // Step 1: Fetch master list
            const masterResult = await proxyFetch(masterUrl);
            if (!masterResult.success || !Array.isArray(masterResult.data)) {
                throw new Error(masterResult.error || 'Failed to fetch master list or data is not an array.');
            }
            setMasterData(masterResult.data);

            const totalItems = masterResult.data.length;

            // Step 2: Fetch details for each item
            const details: any[] = [];
            for (let i = 0; i < totalItems; i++) {
                const item = masterResult.data[i];
                const itemId = item.id || item.ID; // Guess the ID field

                if (!itemId) {
                    console.warn('Item missing ID field:', item);
                    continue; // Skip if no ID
                }

                const detailUrl = `${detailUrlPrefix}${itemId}`;
                const detailResult = await proxyFetch(detailUrl);
                
                if (detailResult.success) {
                    details.push(detailResult.data);
                } else {
                    console.warn(`Failed to fetch details for ID ${itemId}: ${detailResult.error}`);
                }
                setProgress(((i + 1) / totalItems) * 50);
            }
            setDetailedData(details);

            // Step 3: Fetch pricing for each item
            const pricing: any[] = [];
            for (let i = 0; i < totalItems; i++) {
                const item = masterResult.data[i];
                const itemId = item.id || item.ID; // Guess the ID field

                if (!itemId) continue;

                const priceUrl = `${pricingUrl}${itemId}`;
                const priceResult = await proxyFetch(priceUrl);

                if (priceResult.success) {
                    pricing.push(priceResult.data);
                } else {
                    console.warn(`Failed to fetch pricing for ID ${itemId}: ${priceResult.error}`);
                }
                setProgress(50 + ((i + 1) / totalItems) * 50);
            }
            setPricingData(pricing);

            toast({ title: 'Success', description: 'All data fetched successfully.' });

        } catch (e: any) {
            const errorMessage = e.message || 'An unexpected error occurred.';
            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Fetch Failed', description: errorMessage });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleMergeAndSave = async () => {
        if (!masterData || !detailedData || !pricingData) {
            toast({
                variant: 'destructive',
                title: 'Missing Data',
                description: 'Please fetch all three data sets before saving.',
            });
            return;
        }
        setIsSaving(true);
        
        try {
            const getItemId = (item: any): string | number | null => item?.id || item?.ID || item?.Id || null;

            const detailsMap = new Map(detailedData.map(item => [getItemId(item), item]));
            const pricingMap = new Map(pricingData.map(item => [getItemId(item), item]));

            const mergedData = masterData.map(masterItem => {
                const id = getItemId(masterItem);
                if (id === null) return { ...masterItem, merge_error: 'Missing ID' };

                const detailItem = detailsMap.get(id) || {};
                const pricingItem = pricingMap.get(id) || {};

                // Make sure not to spread the id from detail/pricing over master's
                const { id: detailId, ID: detailID, Id: detail_Id, ...restOfDetail } = detailItem;
                const { id: pricingId, ID: pricingID, Id: pricing_Id, ...restOfPricing } = pricingItem;
                
                return { ...masterItem, ...restOfDetail, ...restOfPricing };
            });

            const masterDataSetPath = `data-warehouse/${vendorId}/masterDataSet`;
            const subcollectionRef = collection(firestore, masterDataSetPath);

            const oldDocsSnapshot = await getDocs(query(subcollectionRef));
            if (!oldDocsSnapshot.empty) {
                const deleteBatch = writeBatch(firestore);
                oldDocsSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
                await deleteBatch.commit();
            }
            
            const writeBatchInstance = writeBatch(firestore);
            mergedData.forEach(row => {
                const newRowRef = doc(subcollectionRef);
                writeBatchInstance.set(newRowRef, row);
            });
            await writeBatchInstance.commit();
            
            toast({ title: 'Success', description: 'Master data set has been updated with merged data.' });
            
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: e.message || 'An unexpected error occurred.' });
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Yamaha API Data Fetcher</CardTitle>
                <CardDescription>
                    Enter the master, detail, and pricing API endpoints to fetch and merge product data.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                     <div className="space-y-2">
                        <Label htmlFor="master-url">1. Master Product List API</Label>
                        <Input
                            id="master-url"
                            placeholder="e.g., https://api.yamaha.com/products"
                            value={masterUrl}
                            onChange={(e) => setMasterUrl(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="detail-url">2. Detail API Prefix</Label>
                        <Input
                            id="detail-url"
                            placeholder="e.g., https://api.yamaha.com/products/"
                            value={detailUrlPrefix}
                            onChange={(e) => setDetailUrlPrefix(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="pricing-url">3. Pricing API Prefix</Label>
                        <Input
                            id="pricing-url"
                            placeholder="e.g., https://api.yamaha.com/pricing/"
                            value={pricingUrl}
                            onChange={(e) => setPricingUrl(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                </div>
                 <Button onClick={handleFetchData} disabled={isLoading || isSaving}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                    <span className="ml-2">Fetch All Data</span>
                </Button>
                
                {isLoading && (
                    <div className="space-y-2 pt-4">
                        <Label>Fetching data... {Math.round(progress)}%</Label>
                        <Progress value={progress} />
                    </div>
                )}
                {error && (
                    <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {(masterData || detailedData || pricingData) && (
                    <Tabs defaultValue="master" className="pt-4">
                        <TabsList>
                            <TabsTrigger value="master">Master List</TabsTrigger>
                            <TabsTrigger value="detailed">Detailed Data</TabsTrigger>
                            <TabsTrigger value="pricing">Pricing Data</TabsTrigger>
                        </TabsList>
                        <TabsContent value="master">
                           <div className="max-h-[600px] overflow-auto rounded-md border">
                             <JsonDataVisualizer data={masterData} />
                           </div>
                        </TabsContent>
                        <TabsContent value="detailed">
                            <div className="max-h-[600px] overflow-auto rounded-md border">
                             <JsonDataVisualizer data={detailedData} />
                           </div>
                        </TabsContent>
                         <TabsContent value="pricing">
                            <div className="max-h-[600px] overflow-auto rounded-md border">
                             <JsonDataVisualizer data={pricingData} />
                           </div>
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
            <CardFooter>
                 <Button 
                    onClick={handleMergeAndSave} 
                    disabled={!masterData || !detailedData || !pricingData || isLoading || isSaving}
                >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ml-2">Merge & Save to Master Data Set</span>
                </Button>
            </CardFooter>
        </Card>
    );
}
