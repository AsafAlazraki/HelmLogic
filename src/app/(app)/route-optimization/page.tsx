import { RouteOptimizationForm } from "@/components/route-optimization-form";
import { optimizeRoute, type OptimizeRouteInput } from "@/ai/flows/route-optimization-flow";

export default function RouteOptimizationPage() {
  async function optimize(values: OptimizeRouteInput) {
    'use server';
    try {
        const result = await optimizeRoute(values);
        return result;
    } catch (e) {
        console.error(e);
        return null;
    }
  }

  return (
    <div className="space-y-6">
       <h1 className="text-2xl font-semibold">AI-Powered Route Optimization</h1>
      <RouteOptimizationForm optimize={optimize} />
    </div>
  );
}
