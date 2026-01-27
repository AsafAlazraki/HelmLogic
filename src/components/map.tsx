"use client";

import { APIProvider, Map, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import { useState } from "react";
import { Ship } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const vessels = [
  { id: 'v1', name: 'Neptune Voyager', position: { lat: 34.0522, lng: -118.2437 }, status: 'On Schedule' },
  { id: 'v2', name: 'Triton Express', position: { lat: 51.5074, lng: -0.1278 }, status: 'Delayed' },
  { id: 'v3', name: 'Poseidon Runner', position: { lat: 35.6895, lng: 139.6917 }, status: 'At Port' },
  { id: 'v4', name: 'Oceanic Sprinter', position: { lat: -33.8688, lng: 151.2093 }, status: 'On Schedule' },
];

export function VesselMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [selectedVessel, setSelectedVessel] = useState<(typeof vessels)[0] | null>(null);

  if (!apiKey) {
    return (
        <Card className="h-[600px] flex items-center justify-center">
            <CardContent className="text-center">
                <p className="text-lg font-semibold text-destructive">Google Maps API Key is missing.</p>
                <p className="text-muted-foreground">Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local file.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ height: "600px", width: "100%", borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Map
          defaultCenter={{ lat: 25, lng: 0 }}
          defaultZoom={2}
          mapId="helm-logic-map"
          gestureHandling={'greedy'}
          disableDefaultUI={true}
        >
          {vessels.map((vessel) => (
            <AdvancedMarker
              key={vessel.id}
              position={vessel.position}
              onClick={() => setSelectedVessel(vessel)}
            >
                <Ship className="w-8 h-8 text-primary drop-shadow-lg" />
            </AdvancedMarker>
          ))}
          {selectedVessel && (
            <InfoWindow
              position={selectedVessel.position}
              onCloseClick={() => setSelectedVessel(null)}
              pixelOffset={new google.maps.Size(0,-40)}
            >
                <div>
                    <h3 className="font-bold">{selectedVessel.name}</h3>
                    <p>Status: {selectedVessel.status}</p>
                </div>
            </InfoWindow>
          )}
        </Map>
      </div>
    </APIProvider>
  );
}
