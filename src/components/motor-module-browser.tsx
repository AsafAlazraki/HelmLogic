'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, LayoutGrid, List, Ship } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';

interface DataSet {
    id: string;
    name: string;
    rowCount: number;
}

export function MotorModuleBrowser({ 
    vendor, 
    onMotorSelect 
}: { 
    vendor: any; 
    onMotorSelect: (motor: any, dataSetId: string) => void 
}) {
    const firestore = useFirestore();
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedDataSetId, setSelectedDataSetId] = useState<string | null>(null);

    const dataSetsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/dataSets`), orderBy('name')),
    [firestore, vendor.id]);
    const { data: dataSets, loading: setsLoading } = useCollection<DataSet>(dataSetsQuery);

    useEffect(() => {
        if (dataSets && dataSets.length > 0 && !selectedDataSetId) {
            const preferred = dataSets.find(s => s.name.toLowerCase().includes('outboard') || s.name.toLowerCase().includes('motor')) || dataSets[0];
            setSelectedDataSetId(preferred.id);
        }
    }, [dataSets, selectedDataSetId]);

    const rowsQuery = useMemoFirebase(() => {
        if (!vendor.id || !selectedDataSetId) return null;
        return collection(firestore, `data-warehouse/${vendor.id}/dataSets/${selectedDataSetId}/rows`);
    }, [firestore, vendor.id, selectedDataSetId]);
    const { data: rows, loading: rowsLoading } = useCollection(rowsQuery);

    const filteredRows = useMemo(() => {
        if (!rows) return [];
        if (!searchTerm) return rows;
        const lower = searchTerm.toLowerCase();
        return rows.filter(r => 
            Object.values(r).some(val => String(val ?? '').toLowerCase().includes(lower))
        );
    }, [rows, searchTerm]);

    if (setsLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search motors..." 
                            className="pl-9 h-10 font-bold"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {dataSets && dataSets.length > 1 && (
                        <select 
                            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-bold ring-offset-background"
                            value={selectedDataSetId || ''}
                            onChange={(e) => setSelectedDataSetId(e.target.value)}
                        >
                            {dataSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    )}
                </div>
                <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                    <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('grid')}><LayoutGrid className="h-4 w-4" /></Button>
                    <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')}><List className="h-4 w-4" /></Button>
                </div>
            </div>

            {rowsLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" /></div>
            ) : filteredRows.length > 0 ? (
                <div className={cn(
                    viewMode === 'grid' 
                        ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                        : "space-y-3"
                )}>
                    {filteredRows.map(row => {
                        const imgPath = row.SummaryImage || row.imageUrl;
                        const getImageUrl = (path: string) => {
                            if (!path) return null;
                            const clean = path.trim().replace(/\\/g, '/');
                            if (clean.startsWith('http')) return clean;
                            const prefix = clean.startsWith('/') ? '' : '/';
                            return `https://www.yamaha-motor.com.au${prefix}${clean}`;
                        };
                        const imgUrl = getImageUrl(imgPath);
                        const hpRating = row['HP Rating'] || row.hp;
                        const modelName = row['Model Name'] || row.name || row.Description || 'Unnamed Motor';

                        if (viewMode === 'grid') {
                            return (
                                <Card 
                                    key={row.id} 
                                    className="cursor-pointer hover:border-primary transition-all group overflow-hidden flex flex-col rounded-xl border-2 shadow-sm"
                                    onClick={() => onMotorSelect(row, selectedDataSetId!)}
                                >
                                    <div className="relative h-44 bg-muted/30 border-b">
                                        {imgUrl ? (
                                            <Image 
                                                src={imgUrl} 
                                                alt={String(modelName)} 
                                                fill 
                                                className="object-contain p-4 group-hover:scale-105 transition-transform" 
                                                unoptimized
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center opacity-10"><Ship className="h-12 w-12" /></div>
                                        )}
                                        {hpRating && (
                                            <Badge className="absolute top-2 left-2 font-black shadow-md">{hpRating} HP</Badge>
                                        )}
                                    </div>
                                    <CardHeader className="p-4 flex-grow flex flex-col items-center justify-center gap-1">
                                        <CardTitle className="text-xs font-black uppercase tracking-tight line-clamp-2 text-center leading-tight">{modelName}</CardTitle>
                                        {row['Part Number'] && <CardDescription className="text-[9px] font-mono text-center uppercase font-bold text-primary/60">{row['Part Number']}</CardDescription>}
                                    </CardHeader>
                                </Card>
                            );
                        }

                        return (
                            <div 
                                key={row.id} 
                                className="flex items-center justify-between p-4 border-2 rounded-xl hover:bg-muted/50 cursor-pointer transition-all hover:border-primary/20 bg-background group"
                                onClick={() => onMotorSelect(row, selectedDataSetId!)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="h-14 w-14 relative bg-muted/30 rounded-lg overflow-hidden border">
                                        {imgUrl ? <Image src={imgUrl} alt="Motor" fill className="object-contain p-1" unoptimized /> : <Ship className="h-6 w-6 m-auto mt-4 opacity-10" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-black text-sm uppercase tracking-tight truncate">{modelName}</p>
                                        <p className="text-[10px] font-mono text-muted-foreground uppercase">{row['Part Number'] || 'No Part Number'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {hpRating && <Badge variant="secondary" className="font-black">{hpRating} HP</Badge>}
                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl bg-muted/5 flex flex-col items-center justify-center gap-3">
                    <Ship className="h-10 w-10 opacity-10" />
                    <p className="font-bold text-sm uppercase tracking-widest">No motors found in this data set.</p>
                </div>
            )}
        </div>
    );
}