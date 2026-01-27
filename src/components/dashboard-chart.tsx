"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartData = [
  { type: "Cargo", vessels: 186, fill: "var(--color-cargo)" },
  { type: "Tanker", vessels: 125, fill: "var(--color-tanker)" },
  { type: "Container", vessels: 95, fill: "var(--color-container)" },
  { type: "Bulk Carrier", vessels: 150, fill: "var(--color-bulk)" },
  { type: "Tug", vessels: 75, fill: "var(--color-tug)" },
]

const chartConfig = {
  vessels: {
    label: "Vessels",
  },
  cargo: {
    label: "Cargo",
    color: "hsl(var(--chart-1))",
  },
  tanker: {
    label: "Tanker",
    color: "hsl(var(--chart-2))",
  },
  container: {
    label: "Container",
    color: "hsl(var(--chart-3))",
  },
  bulk: {
    label: "Bulk Carrier",
    color: "hsl(var(--chart-4))",
  },
  tug: {
    label: "Tug",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig

export function DashboardChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vessels by Type</CardTitle>
        <CardDescription>An overview of the fleet composition.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="type"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar dataKey="vessels" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
