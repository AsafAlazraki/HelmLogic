'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, TestTube2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { proxyFetch } from '@/actions/proxy-fetch';
import { JsonDataVisualizer } from './json-data-visualizer';
import { Progress } from './ui/progress';

export function YamahaApiFetcher() {
    const [masterUrl, setMasterUrl] = useState('');
    const [detailUrlPrefix, setDetailUrlPrefix] = useState('');
    const [masterData, setMasterData] = useState<any[] | null>(null);
    const [detailedData, setDetailedData] = useState<any[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const { toast } = useToast();

    const handleFetchData = async () => {
        if (!masterUrl || !detailUrlPrefix) {
            setError("Please enter both API URLs.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setMasterData(null);
        setDetailedData(null);
        setProgress(0);

        try {
            // Step 1: Fetch master list
            const masterResult = await proxyFetch(masterUrl);
            if (!masterResult.success || !Array.isArray(masterResult.data)) {
                throw new Error(masterResult.error || 'Failed to fetch master list or data is not an array.');
            }
            setMasterData(masterResult.data);

            // Step 2: Fetch details for each item
            const details: any[] = [];
            const totalItems = masterResult.data.length;

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
                setProgress(((i + 1) / totalItems) * 100);
            }

            setDetailedData(details);
            toast({ title: 'Success', description: 'All data fetched successfully.' });

        } catch (e: any) {
            const errorMessage = e.message || 'An unexpected error occurred.';
            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Fetch Failed', description: errorMessage });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Yamaha API Data Fetcher</CardTitle>
                <CardDescription>
                    Enter the master and detail API endpoints to fetch and view product data.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label htmlFor="master-url">Master Product List API</Label>
                        <Input
                            id="master-url"
                            placeholder="https://api.example.com/products"
                            value={masterUrl}
                            onChange={(e) => setMasterUrl(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="detail-url">Detail API Prefix</Label>
                        <Input
                            id="detail-url"
                            placeholder="https://api.example.com/products/"
                            value={detailUrlPrefix}
                            onChange={(e) => setDetailUrlPrefix(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                </div>
                 <Button onClick={handleFetchData} disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                    <span className="ml-2">Fetch Data</span>
                </Button>
                
                {isLoading && (
                    <div className="space-y-2 pt-4">
                        <Label>Fetching details... {Math.round(progress)}%</Label>
                        <Progress value={progress} />
                    </div>
                )}
                {error && (
                    <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {(masterData || detailedData) && (
                    <Tabs defaultValue="master" className="pt-4">
                        <TabsList>
                            <TabsTrigger value="master">Master List</TabsTrigger>
                            <TabsTrigger value="detailed">Detailed Data</TabsTrigger>
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
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}
