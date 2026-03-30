'use client';

import { useState, useMemo, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InventoryItem {
    id: string;
    name: string;
    stockNumber: string;
    status: string;
    location: string;
    model: string;
    colour: string;
    material: string;
    organisationId: string;
}

interface StockLocationMapProps {
    inventory: InventoryItem[];
    locations: string[];
    onItemClick?: (item: InventoryItem) => void;
}

// ---------------------------------------------------------------------------
// Location coordinates
// ---------------------------------------------------------------------------

const LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
    'boondall': { lat: -27.3393, lng: 153.0567 },
    'coomera': { lat: -27.8618, lng: 153.3542 },
    'brisbane': { lat: -27.4705, lng: 153.0260 },
    'gold coast': { lat: -28.0167, lng: 153.4000 },
    'sydney': { lat: -33.8688, lng: 151.2093 },
    'melbourne': { lat: -37.8136, lng: 144.9631 },
};

function getLocationCoords(location: string): { lat: number; lng: number } | null {
    if (!location) return null;
    const key = location.toLowerCase().trim();
    return LOCATION_COORDS[key] || null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LocationGroup {
    name: string;
    coords: { lat: number; lng: number } | null;
    items: InventoryItem[];
    inStock: number;
    onOrder: number;
}

function groupByLocation(inventory: InventoryItem[]): LocationGroup[] {
    const map = new Map<string, InventoryItem[]>();

    for (const item of inventory) {
        const loc = item.location?.trim() || '';
        const key = loc || '__unknown__';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
    }

    const groups: LocationGroup[] = [];
    for (const [key, items] of map) {
        const name = key === '__unknown__' ? 'Unknown Location' : key;
        const coords = key === '__unknown__' ? null : getLocationCoords(key);
        const inStock = items.filter(
            (i) => i.status?.toLowerCase() === 'in stock' || i.status?.toLowerCase() === 'available',
        ).length;
        const onOrder = items.filter(
            (i) => i.status?.toLowerCase() === 'on order' || i.status?.toLowerCase() === 'ordered',
        ).length;
        groups.push({ name, coords, items, inStock, onOrder });
    }

    return groups.sort((a, b) => a.name.localeCompare(b.name));
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    const s = status?.toLowerCase() ?? '';
    if (s === 'in stock' || s === 'available') return 'default';
    if (s === 'on order' || s === 'ordered') return 'secondary';
    if (s === 'sold') return 'destructive';
    return 'outline';
}

// ---------------------------------------------------------------------------
// Info window content
// ---------------------------------------------------------------------------

function InfoWindowContent({
    group,
    onItemClick,
}: {
    group: LocationGroup;
    onItemClick?: (item: InventoryItem) => void;
}) {
    const MAX_VISIBLE = 5;
    const visible = group.items.slice(0, MAX_VISIBLE);
    const remaining = group.items.length - MAX_VISIBLE;

    return (
        <div className="min-w-[180px] max-w-[240px]">
            <p className="text-xs font-bold mb-1">{group.name}</p>
            <div className="flex flex-col gap-1">
                {visible.map((item) => (
                    <div
                        key={item.id}
                        className={`flex items-center gap-1.5 text-xs ${onItemClick ? 'cursor-pointer hover:bg-slate-50 rounded px-1 -mx-1' : ''}`}
                        onClick={() => onItemClick?.(item)}
                    >
                        <span className="truncate flex-1">
                            {item.model} &middot; {item.stockNumber}
                        </span>
                        <Badge variant={statusVariant(item.status)} className="text-[9px] px-1.5 py-0 leading-4 shrink-0">
                            {item.status}
                        </Badge>
                    </div>
                ))}
            </div>
            {remaining > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">and {remaining} more&hellip;</p>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Inner map component (must be inside APIProvider to use useMap hook)
// ---------------------------------------------------------------------------

function StockMapContent({
    groups,
    selectedLocation,
    setSelectedLocation,
    unmappedCount,
    onItemClick,
}: {
    groups: LocationGroup[];
    selectedLocation: string | null;
    setSelectedLocation: (loc: string | null) => void;
    unmappedCount: number;
    onItemClick?: (item: InventoryItem) => void;
}) {
    const selectedGroup = groups.find((g) => g.name === selectedLocation) ?? null;

    return (
        <div className="flex-1 min-h-[300px] rounded-2xl border-2 overflow-hidden relative">
            <Map
                defaultCenter={{ lat: -27.5, lng: 153.0 }}
                defaultZoom={10}
                mapId="helm-logic-stock-map"
                gestureHandling="greedy"
                disableDefaultUI={true}
            >
                {groups
                    .filter((g) => g.coords)
                    .map((group) => (
                        <AdvancedMarker
                            key={group.name}
                            position={group.coords!}
                            onClick={() => setSelectedLocation(group.name)}
                        >
                            <div className="flex flex-col items-center">
                                <div className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-black shadow-md whitespace-nowrap">
                                    {group.name} ({group.items.length})
                                </div>
                                <MapPin className="h-6 w-6 text-primary drop-shadow-lg -mt-0.5" />
                            </div>
                        </AdvancedMarker>
                    ))}

                {selectedGroup && selectedGroup.coords && (
                    <InfoWindow
                        position={selectedGroup.coords}
                        onCloseClick={() => setSelectedLocation(null)}
                    >
                        <InfoWindowContent group={selectedGroup} onItemClick={onItemClick} />
                    </InfoWindow>
                )}
            </Map>

            {unmappedCount > 0 && (
                <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur rounded-xl border-2 px-3 py-1.5 text-[10px] text-slate-500 font-medium shadow-sm">
                    {unmappedCount} item{unmappedCount !== 1 ? 's' : ''} have no map coordinates
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StockLocationMap({ inventory, locations, onItemClick }: StockLocationMapProps) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

    const groups = useMemo(() => groupByLocation(inventory), [inventory]);

    const unmappedCount = useMemo(
        () => groups.filter((g) => !g.coords).reduce((sum, g) => sum + g.items.length, 0),
        [groups],
    );

    const handleCardClick = useCallback(
        (group: LocationGroup) => {
            setSelectedLocation(group.name);
        },
        [],
    );

    // ----- Map area -----

    const mapArea = apiKey ? (
        <APIProvider apiKey={apiKey}>
            <StockMapContent
                groups={groups}
                selectedLocation={selectedLocation}
                setSelectedLocation={setSelectedLocation}
                unmappedCount={unmappedCount}
                onItemClick={onItemClick}
            />
        </APIProvider>
    ) : (
        <div className="flex-1 min-h-[300px] rounded-2xl border-2 overflow-hidden flex flex-col items-center justify-center p-12 text-center gap-4 bg-slate-50">
            <MapPin className="h-16 w-16 text-slate-200" />
            <div>
                <p className="text-sm font-bold text-slate-700">Map View Unavailable</p>
                <p className="text-xs text-slate-500 mt-1">Google Maps API key not configured</p>
            </div>
        </div>
    );

    // ----- Location cards -----

    const locationCards = (
        <div className="flex gap-3 overflow-x-auto pb-2 px-1">
            {groups.map((group) => (
                <div
                    key={group.name}
                    onClick={() => handleCardClick(group)}
                    className={`border-2 rounded-2xl p-3 min-w-[180px] shrink-0 bg-white cursor-pointer hover:border-primary/40 transition-all ${
                        selectedLocation === group.name ? 'border-primary/60 shadow-md' : ''
                    }`}
                >
                    <div className="flex items-center gap-1.5 mb-1">
                        <MapPin className="h-3 w-3 text-primary shrink-0" />
                        <span className="text-xs font-bold truncate">{group.name}</span>
                    </div>
                    <p className="text-xl font-black">{group.items.length}</p>
                    <div className="flex gap-2 mt-1">
                        {group.inStock > 0 && (
                            <span className="text-[9px] uppercase tracking-widest font-black text-emerald-600">
                                {group.inStock} in stock
                            </span>
                        )}
                        {group.onOrder > 0 && (
                            <span className="text-[9px] uppercase tracking-widest font-black text-amber-600">
                                {group.onOrder} on order
                            </span>
                        )}
                        {group.inStock === 0 && group.onOrder === 0 && (
                            <span className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                                {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    // ----- Render -----

    return (
        <div className="flex flex-col gap-4 h-full">
            {mapArea}
            {locationCards}
        </div>
    );
}
