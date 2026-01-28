import { VesselMap } from "@/components/map";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";

export default function RealTimeTrackingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Real-Time Vessel Tracking</h1>
        <BreadcrumbNav />
      </div>
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
