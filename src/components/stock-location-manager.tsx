
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, MapPin, Lock, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const ALL_STOCK_COLUMNS = [
    { id: 'dateIntoStock', label: 'Date into Stock / ETA' },
    { id: 'daysInStock', label: 'Days in Stock' },
    { id: 'status', label: 'Status' },
    { id: 'location', label: 'Location' },
    { id: 'soldBy', label: 'Sold By' },
    { id: 'stockNumber', label: 'Stock Number' },
    { id: 'label', label: 'Label' },
    { id: 'model', label: 'Model' },
    { id: 'colour', label: 'Colour' },
    { id: 'serialNumber', label: 'Serial Number' },
    { id: 'material', label: 'Material' },
    { id: 'notes', label: 'Notes' },
];

interface StockLocationManagerProps {
    moduleId: string;
    locations: string[];
    stockVisibleToSubDealers?: boolean;
    subDealerVisibleColumns?: string[];
}

export function StockLocationManager({ moduleId, locations, stockVisibleToSubDealers: initialVisibility = false, subDealerVisibleColumns: initialVisibleColumns = [] }: StockLocationManagerProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [newLocation, setNewLocation] = useState('');
    const [stockVisible, setStockVisible] = useState(initialVisibility);
    const [visibleColumns, setVisibleColumns] = useState<string[]>(
        initialVisibleColumns.length > 0 ? initialVisibleColumns : ALL_STOCK_COLUMNS.map(c => c.id)
    );

    // Sync with prop when module doc updates externally
    useEffect(() => {
        setStockVisible(initialVisibility);
    }, [initialVisibility]);

    // Sync visible columns with prop
    useEffect(() => {
        if (initialVisibleColumns && initialVisibleColumns.length > 0) {
            setVisibleColumns(initialVisibleColumns);
        }
    }, [initialVisibleColumns]);

    const moduleRef = useMemoFirebase(
        () => doc(firestore, 'modules', moduleId),
        [firestore, moduleId]
    );

    const handleAddLocation = async () => {
        const trimmed = newLocation.trim();
        if (!trimmed) return;

        const isDuplicate = locations.some(
            (loc) => loc.toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast({ variant: 'destructive', title: 'Location already exists' });
            return;
        }

        try {
            const updatedLocations = [...locations, trimmed];
            await updateDoc(moduleRef, { stockLocations: updatedLocations });
            setNewLocation('');
            toast({ title: 'Location added' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Failed to update locations' });
        }
    };

    const handleRemoveLocation = async (locationToRemove: string) => {
        try {
            const updatedLocations = locations.filter((loc) => loc !== locationToRemove);
            await updateDoc(moduleRef, { stockLocations: updatedLocations.length > 0 ? updatedLocations : [] });
            toast({ title: 'Location removed' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Failed to update locations' });
        }
    };

    const handleToggleColumn = async (colId: string) => {
        const updated = visibleColumns.includes(colId)
            ? visibleColumns.filter(c => c !== colId)
            : [...visibleColumns, colId];
        setVisibleColumns(updated);
        try {
            await updateDoc(moduleRef, { subDealerVisibleColumns: updated });
            toast({ title: 'Column visibility updated' });
        } catch (error) {
            console.error('Failed to update column visibility:', error);
            toast({ variant: 'destructive', title: 'Failed to update' });
        }
    };

    const handleToggleVisibility = async (visible: boolean) => {
        try {
            await updateDoc(moduleRef, { stockVisibleToSubDealers: visible });
            setStockVisible(visible);
            toast({ title: visible ? 'Stock shared with sub-dealers' : 'Stock set to private' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Failed to update visibility' });
        }
    };

    return (
        <div className="space-y-4">
            {/* Stock Locations Card */}
            <Card className="rounded-2xl border-2">
                <CardHeader>
                    <CardTitle className="text-xs font-bold">Stock Locations</CardTitle>
                    <CardDescription className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                        Define locations where stock can be stored
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {/* Location List */}
                    {locations.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                            No locations defined yet
                        </p>
                    ) : (
                        <div className="space-y-1">
                            {locations.map((location) => (
                                <div
                                    key={location}
                                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50"
                                >
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-semibold">{location}</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 rounded-lg text-destructive"
                                        onClick={() => handleRemoveLocation(location)}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add Location Input */}
                    <div className="flex items-center gap-2 pt-2">
                        <Input
                            value={newLocation}
                            onChange={(e) => setNewLocation(e.target.value)}
                            placeholder="Enter location name..."
                            className="text-xs rounded-xl border-2"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddLocation();
                                }
                            }}
                        />
                        <Button
                            onClick={handleAddLocation}
                            className="rounded-xl text-xs"
                            disabled={!newLocation.trim()}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Stock Visibility Card */}
            <Card className="rounded-2xl border-2">
                <CardHeader>
                    <CardTitle className="text-xs font-bold">Stock Visibility</CardTitle>
                    <CardDescription className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                        When enabled, sub-dealers can view your stock inventory in their module workspace
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleToggleVisibility(false)}
                            className={cn(
                                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center',
                                !stockVisible
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : 'border-muted hover:border-muted-foreground/20 text-muted-foreground'
                            )}
                        >
                            <Lock className="h-5 w-5" />
                            <span className="text-xs font-bold">Private</span>
                        </button>
                        <button
                            onClick={() => handleToggleVisibility(true)}
                            className={cn(
                                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center',
                                stockVisible
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : 'border-muted hover:border-muted-foreground/20 text-muted-foreground'
                            )}
                        >
                            <Globe className="h-5 w-5" />
                            <span className="text-xs font-bold">Shared with Sub-Dealers</span>
                        </button>
                    </div>
                </CardContent>
            </Card>

            {/* Sub-Dealer Visible Columns Card */}
            {stockVisible && (
                <Card className="border-2 rounded-2xl">
                    <CardHeader>
                        <CardTitle className="text-xs font-bold">Sub-Dealer Visible Columns</CardTitle>
                        <CardDescription className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                            Choose which stock columns sub-dealers can see
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {ALL_STOCK_COLUMNS.map(col => {
                                const isChecked = visibleColumns.includes(col.id);
                                return (
                                    <label key={col.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handleToggleColumn(col.id)}
                                            className="rounded border-2"
                                        />
                                        <span className="text-xs font-semibold">{col.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
