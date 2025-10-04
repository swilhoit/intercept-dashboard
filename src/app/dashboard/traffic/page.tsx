"use client"

import { TrafficAnalytics } from "@/components/dashboard/traffic-analytics"
import { useDashboard } from "../dashboard-context"

export default function TrafficPage() {
  const { dateRange } = useDashboard()

  return <TrafficAnalytics dateRange={dateRange} />
}


