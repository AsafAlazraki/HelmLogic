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
    const [detailUrlPrefix1, setDetailUrlPrefix1] = useState('');
    const [detailUrlPrefix2, setDetailUrlPrefix2] = useState('');
    const [masterData, setMasterData] = useState<any[] | null>(null);
    const [detailedData1, setDetailedData1] = useState<any[] | null>(null);
    const [detailedData2, setDetailedData2] = useState<any[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const { toast } = useToast();
    const firestore = useFirestore();

    const handleFetchData = async () => {
        if (!masterUrl || !detailUrlPrefix1 || !detailUrlPrefix2) {
            setError("Please enter all three API URLs.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setMasterData(null);
        setDetailedData1(null);
        setDetailedData2(null);
        setProgress(0);

        try {
            // Step 1: Fetch master list
            const masterResult = await proxyFetch(masterUrl);
            if (!masterResult.success || !Array.isArray(masterResult.data)) {
                throw new Error(masterResult.error || 'Failed to fetch master list or data is not an array.');
            }
            setMasterData(masterResult.data);
            setProgress(10); // Initial progress

            const totalItems = masterResult.data.length;

            // Step 2: Fetch details for each item from API 1
            const details1: any[] = [];
            for (let i = 0; i < totalItems; i++) {
                const item = masterResult.data[i];
                const itemId = item.id || item.ID; // Guess the ID field

                if (!itemId) {
                    console.warn('Item missing ID field:', item);
                    continue; // Skip if no ID
                }

                const detailUrl = `${detailUrlPrefix1}${itemId}`;
                const detailResult = await proxyFetch(detailUrl);
                
                if (detailResult.success) {
                    details1.push(detailResult.data);
                } else {
                    console.warn(`Failed to fetch details from API 1 for ID ${itemId}: ${detailResult.error}`);
                }
                setProgress(10 + ((i + 1) / totalItems) * 45); // Progress from 10% to 55%
            }
            setDetailedData1(details1);

            // Step 3: Fetch details for each item from API 2
            const details2: any[] = [];
            for (let i = 0; i < totalItems; i++) {
                const item = masterResult.data[i];
                const itemId = item.id || item.ID; // Guess the ID field

                if (!itemId) continue;

                const detailUrl = `${detailUrlPrefix2}${itemId}`;
                const detailResult = await proxyFetch(detailUrl);

                if (detailResult.success) {
                    details2.push(detailResult.data);
                } else {
                    console.warn(`Failed to fetch details from API 2 for ID ${itemId}: ${detailResult.error}`);
                }
                setProgress(55 + ((i + 1) / totalItems) * 45); // Progress from 55% to 100%
            }
            setDetailedData2(details2);

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
        if (!masterData || !detailedData1 || !detailedData2) {
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

            const details1Map = new Map(detailedData1.map(item => [getItemId(item), item]));
            const details2Map = new Map(detailedData2.map(item => [getItemId(item), item]));

            const mergedData = masterData.map(masterItem => {
                const id = getItemId(masterItem);
                if (id === null) return { ...masterItem, merge_error: 'Missing ID' };

                const detailItem1 = details1Map.get(id) || {};
                const detailItem2 = details2Map.get(id) || {};

                const { id: detail1Id, ID: detail1ID, Id: detail1_Id, ...restOfDetail1 } = detailItem1;
                const { id: detail2Id, ID: detail2ID, Id: detail2_Id, ...restOfDetail2 } = detailItem2;
                
                return { ...masterItem, ...restOfDetail1, ...restOfDetail2 };
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
                    Enter the master and detail API endpoints to fetch and merge product data.
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
                        <Label htmlFor="detail-url-1">2. Detail API 1 Prefix</Label>
                        <Input
                            id="detail-url-1"
                            placeholder="e.g., https://api.yamaha.com/details1/"
                            value={detailUrlPrefix1}
                            onChange={(e) => setDetailUrlPrefix1(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="detail-url-2">3. Detail API 2 Prefix</Label>
                        <Input
                            id="detail-url-2"
                            placeholder="e.g., https://api.yamaha.com/details2/"
                            value={detailUrlPrefix2}
                            onChange={(e) => setDetailUrlPrefix2(e.target.value)}
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
                {(masterData || detailedData1 || detailedData2) && (
                    <Tabs defaultValue="master" className="pt-4">
                        <TabsList>
                            <TabsTrigger value="master">Master List</TabsTrigger>
                            <TabsTrigger value="detailed1">Detailed Data 1</TabsTrigger>
                            <TabsTrigger value="detailed2">Detailed Data 2</TabsTrigger>
                        </TabsList>
                        <TabsContent value="master">
                           <div className="max-h-[600px] overflow-auto rounded-md border">
                             <JsonDataVisualizer data={masterData} />
                           </div>
                        </TabsContent>
                        <TabsContent value="detailed1">
                            <div className="max-h-[600px] overflow-auto rounded-md border">
                             <JsonDataVisualizer data={detailedData1} />
                           </div>
                        </TabsContent>
                         <TabsContent value="detailed2">
                            <div className="max-h-[600px] overflow-auto rounded-md border">
                             <JsonDataVisualizer data={detailedData2} />
                           </div>
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
            <CardFooter>
                 <Button 
                    onClick={handleMergeAndSave} 
                    disabled={!masterData || !detailedData1 || !detailedData2 || isLoading || isSaving}
                >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ml-2">Merge & Save to Master Data Set</span>
                </Button>
            </CardFooter>
        </Card>
    );
}
