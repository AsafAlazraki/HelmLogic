import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { ClipboardList } from "lucide-react";

// Hardcoded test data removed for production state.
const reports: any[] = [];

export default function ReportingPage() {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Completed":
        return "default";
      case "In Progress":
        return "secondary";
      case "Delayed":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reporting</h1>
        <BreadcrumbNav />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Activity Reports</CardTitle>
          <CardDescription>A summary of current vessel journeys and logistical status.</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.id}</TableCell>
                    <TableCell>{report.date}</TableCell>
                    <TableCell>{report.vessel}</TableCell>
                    <TableCell>{report.route}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(report.status) as any}>{report.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground opacity-20">
                <ClipboardList className="h-16 w-16 mb-4" />
                <p className="font-black uppercase tracking-widest text-sm">No Active Reports Found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
