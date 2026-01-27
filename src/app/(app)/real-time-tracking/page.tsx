import { VesselMap } from "@/components/map";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RealTimeTrackingPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Real-Time Vessel Tracking</h1>
      <Card>
        <CardHeader>
          <CardTitle>Global Fleet Map</CardTitle>
          <CardDescription>Live positions of active vessels. Click a vessel for more details.</CardDescription>
        </CardHeader>
        <CardContent>
          <VesselMap />
        </CardContent>
      </Card>
    </div>
  );
}
