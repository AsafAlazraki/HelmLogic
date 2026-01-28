import { RouteOptimizationForm } from "@/components/route-optimization-form";
import { optimizeRoute, type OptimizeRouteInput } from "@/ai/flows/route-optimization-flow";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">AI-Powered Route Optimization</h1>
        <BreadcrumbNav />
      </div>
      <RouteOptimizationForm optimize={optimize} />
    </div>
  );
}
