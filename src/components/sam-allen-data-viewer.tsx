'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function JsonDataViewer({ data }: { data: any[] | null }) {
    if (!data || data.length === 0) {
        return <p className="text-muted-foreground p-4 text-center h-48 flex items-center justify-center">No data found in this data set.</p>;
    }
    const headers = Object.keys(data[0]);
    return (
        <div className="overflow-auto max-h-[600px] border rounded-md">
            <Table>
                <TableHeader className="sticky top-0 bg-secondary z-10">
                    <TableRow>
                        {headers.map((header) => <TableHead key={header}>{header}</TableHead>)}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                            {headers.map((header) => (
                                <TableCell key={header}>
                                    {String(row[header] ?? '')}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function DataSetViewer({ vendorId, collectionName }: { vendorId: string, collectionName: string }) {
    const { data, loading } = useCollection(`data-warehouse/${vendorId}/${collectionName}`);
    
    if (loading) {
        return (
            <div className="flex justify-center items-center h-48">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    return <JsonDataViewer data={data} />;
}

export function SamAllenDataViewer({ vendorId }: { vendorId: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Master Data Sets</CardTitle>
                <CardDescription>View the stored price lists for Sam Allen.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="master-price-list">
                    <TabsList>
                        <TabsTrigger value="master-price-list">Master Price List</TabsTrigger>
                        <TabsTrigger value="bulk-master-price-list">Bulk Master Price List</TabsTrigger>
                    </TabsList>
                    <TabsContent value="master-price-list" className="mt-4">
                        <DataSetViewer vendorId={vendorId} collectionName="masterPriceList" />
                    </TabsContent>
                    <TabsContent value="bulk-master-price-list" className="mt-4">
                        <DataSetViewer vendorId={vendorId} collectionName="bulkMasterPriceList" />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
