import { BreadcrumbNav } from "@/components/breadcrumb-nav";

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <BreadcrumbNav />
      </div>
      <p>Welcome to your dashboard.</p>
    </div>
  )
}
