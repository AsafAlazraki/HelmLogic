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

const reports = [
  { id: "REP-001", date: "2024-05-15", vessel: "Neptune Voyager", route: "SHA-RTM", status: "Completed" },
  { id: "REP-002", date: "2024-05-16", vessel: "Triton Express", route: "LGB-SIN", status: "In Progress" },
  { id: "REP-003", date: "2024-05-17", vessel: "Poseidon Runner", route: "TYO-HAM", status: "Completed" },
  { id: "REP-004", date: "2024-05-18", vessel: "Oceanic Sprinter", route: "SYD-LAX", status: "Delayed" },
  { id: "REP-005", date: "2024-05-19", vessel: "Neptune Voyager", route: "RTM-NYC", status: "Scheduled" },
  { id: "REP-006", date: "2024-05-20", vessel: "Triton Express", route: "SIN-DXB", status: "In Progress" },
]

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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reporting</h1>
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity Reports</CardTitle>
          <CardDescription>A summary of recent vessel journeys and their statuses.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  )
}
