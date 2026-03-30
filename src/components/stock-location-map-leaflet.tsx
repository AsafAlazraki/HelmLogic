'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationGroup {
    location: string;
    coords: { lat: number; lng: number } | null;
    items: {
        id: string;
        name: string;
        stockNumber: string;
        status: string;
        model: string;
        material: string;
    }[];
}

interface LeafletMapProps {
    groups: LocationGroup[];
    selectedLocation: string | null;
    onSelectLocation: (location: string | null) => void;
}

// Custom marker icon using a colored circle
function createMarkerIcon(count: number) {
    const size = Math.min(40 + count * 2, 56);
    return L.divIcon({
        className: '',
        html: `<div style="
            width: ${size}px;
            height: ${size}px;
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            border: 3px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 900;
            font-size: ${count > 99 ? '11' : '13'}px;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        ">${count}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2)],
    });
}

// Pan to selected location
function PanToLocation({ groups, selectedLocation }: { groups: LocationGroup[]; selectedLocation: string | null }) {
    const map = useMap();

    useEffect(() => {
        if (!selectedLocation) return;
        const group = groups.find(g => g.location === selectedLocation);
        if (group?.coords) {
            map.flyTo([group.coords.lat, group.coords.lng], 13, { duration: 0.8 });
        }
    }, [selectedLocation, groups, map]);

    return null;
}

export default function StockLocationMapLeaflet({ groups, selectedLocation, onSelectLocation }: LeafletMapProps) {
    const defaultCenter: [number, number] = [-27.5, 153.0]; // SE Queensland
    const defaultZoom = groups.length > 0 ? 8 : 5;

    // Calculate bounds to fit all markers
    const bounds = groups.length > 0
        ? L.latLngBounds(groups.filter(g => g.coords).map(g => [g.coords!.lat, g.coords!.lng] as [number, number]))
        : null;

    return (
        <MapContainer
            center={bounds ? bounds.getCenter() : defaultCenter}
            zoom={defaultZoom}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
            zoomControl={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <PanToLocation groups={groups} selectedLocation={selectedLocation} />
            {groups.map((group) => {
                if (!group.coords) return null;
                const inStock = group.items.filter(i => i.status === 'In Stock').length;
                const onOrder = group.items.filter(i => i.status === 'On Order').length;
                return (
                    <Marker
                        key={group.location}
                        position={[group.coords.lat, group.coords.lng]}
                        icon={createMarkerIcon(group.items.length)}
                        eventHandlers={{
                            click: () => onSelectLocation(group.location),
                        }}
                    >
                        <Popup>
                            <div style={{ minWidth: '180px', fontFamily: 'system-ui, sans-serif' }}>
                                <p style={{ fontWeight: 900, fontSize: '13px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {group.location}
                                </p>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                    {inStock > 0 && <span style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a' }}>{inStock} IN STOCK</span>}
                                    {onOrder > 0 && <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb' }}>{onOrder} ON ORDER</span>}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    {group.items.slice(0, 5).map((item) => (
                                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0', borderBottom: '1px solid #f1f5f9' }}>
                                            <span style={{ fontWeight: 600 }}>{item.model || item.name}</span>
                                            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#6366f1' }}>{item.stockNumber}</span>
                                        </div>
                                    ))}
                                    {group.items.length > 5 && (
                                        <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px' }}>
                                            and {group.items.length - 5} more
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
