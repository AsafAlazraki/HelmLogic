'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import dynamic from 'next/dynamic';

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

interface LocationGroup {
    location: string;
    coords: { lat: number; lng: number } | null;
    items: InventoryItem[];
}

// ---------------------------------------------------------------------------
// Known location coordinates (no API key needed)
// ---------------------------------------------------------------------------

const LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
    'boondall': { lat: -27.3393, lng: 153.0567 },
    'coomera': { lat: -27.8618, lng: 153.3542 },
    'brisbane': { lat: -27.4705, lng: 153.0260 },
    'gold coast': { lat: -28.0167, lng: 153.4000 },
    'sydney': { lat: -33.8688, lng: 151.2093 },
    'melbourne': { lat: -37.8136, lng: 144.9631 },
    'perth': { lat: -31.9505, lng: 115.8605 },
    'adelaide': { lat: -34.9285, lng: 138.6007 },
    'hobart': { lat: -42.8821, lng: 147.3272 },
    'darwin': { lat: -12.4634, lng: 130.8456 },
    'cairns': { lat: -16.9186, lng: 145.7781 },
    'townsville': { lat: -19.2590, lng: 146.8169 },
    'sunshine coast': { lat: -26.6500, lng: 153.0667 },
    'mackay': { lat: -21.1411, lng: 149.1861 },
    'bundaberg': { lat: -24.8661, lng: 152.3489 },
    'hervey bay': { lat: -25.2884, lng: 152.8486 },
    'noosa': { lat: -26.3925, lng: 153.0655 },
    'mooloolaba': { lat: -26.6814, lng: 153.1189 },
    'manly': { lat: -27.4528, lng: 153.1898 },
    'redcliffe': { lat: -27.2308, lng: 153.0976 },
    'scarborough': { lat: -27.2039, lng: 153.1064 },
    'sandgate': { lat: -27.3231, lng: 153.0657 },
};

function getLocationCoords(location: string): { lat: number; lng: number } | null {
    if (!location) return null;
    const key = location.toLowerCase().trim();
    return LOCATION_COORDS[key] || null;
}

// ---------------------------------------------------------------------------
// Leaflet Map (dynamically imported to avoid SSR issues)
// ---------------------------------------------------------------------------

const LeafletMap = dynamic(() => import('./stock-location-map-leaflet'), {
    ssr: false,
    loading: () => (
        <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-2xl border-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Loading map...</p>
        </div>
    ),
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StockLocationMap({ inventory, locations, onItemClick }: StockLocationMapProps) {
    const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

    const locationGroups = useMemo(() => {
        const groups: Record<string, LocationGroup> = {};

        for (const item of inventory) {
            const loc = item.location || 'Unknown';
            if (!groups[loc]) {
                groups[loc] = {
                    location: loc,
                    coords: getLocationCoords(loc),
                    items: [],
                };
            }
            groups[loc].items.push(item);
        }

        return Object.values(groups).sort((a, b) => b.items.length - a.items.length);
    }, [inventory]);

    const mappableGroups = locationGroups.filter(g => g.coords !== null);
    const unmappedCount = locationGroups.filter(g => g.coords === null).reduce((sum, g) => sum + g.items.length, 0);

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Map */}
            <div className="flex-1 min-h-[300px] rounded-2xl border-2 overflow-hidden relative">
                <LeafletMap
                    groups={mappableGroups}
                    selectedLocation={selectedLocation}
                    onSelectLocation={setSelectedLocation}
                />
                {unmappedCount > 0 && (
                    <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-xl border-2 px-3 py-2 z-[1000]">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            {unmappedCount} item{unmappedCount !== 1 ? 's' : ''} without map coordinates
                        </p>
                    </div>
                )}
            </div>

            {/* Location Summary Cards */}
            <div className="shrink-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Locations</p>
                <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 px-1">
                    {locationGroups.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4">No stock items</p>
                    ) : (
                        locationGroups.map((group) => {
                            const inStock = group.items.filter(i => i.status === 'In Stock').length;
                            const onOrder = group.items.filter(i => i.status === 'On Order').length;
                            const isSelected = selectedLocation === group.location;
                            return (
                                <Card
                                    key={group.location}
                                    className={`border-2 rounded-2xl p-3 min-w-[180px] shrink-0 bg-white cursor-pointer transition-all ${isSelected ? 'border-primary shadow-md' : 'hover:border-primary/40'}`}
                                    onClick={() => setSelectedLocation(group.location)}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <MapPin className={`h-4 w-4 ${group.coords ? 'text-primary' : 'text-slate-400'}`} />
                                        <span className="text-xs font-bold truncate">{group.location}</span>
                                    </div>
                                    <p className="text-xl font-black text-slate-900">{group.items.length}</p>
                                    <div className="flex gap-2 mt-1">
                                        {inStock > 0 && <span className="text-[9px] font-black uppercase tracking-widest text-green-600">{inStock} in stock</span>}
                                        {onOrder > 0 && <span className="text-[9px] font-black uppercase tracking-widest text-blue-600">{onOrder} on order</span>}
                                    </div>
                                </Card>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
