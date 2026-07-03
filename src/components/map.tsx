"use client";

import { APIProvider, Map, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import { useState } from "react";
import { Ship } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

// Hardcoded test data removed for production state.
const vessels: any[] = [];

export function VesselMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [selectedVessel, setSelectedVessel] = useState<any | null>(null);

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
          defaultCenter={{ lat: -25, lng: 133 }} // Centered on Australia
          defaultZoom={4}
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
              pixelOffset={[0, -40]}
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
