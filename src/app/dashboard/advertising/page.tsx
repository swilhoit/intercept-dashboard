"use client"

import { CombinedAdvertisingDashboard } from "@/components/dashboard/combined-advertising-dashboard"
import { useDashboard } from "../dashboard-context"

export default function AdvertisingPage() {
  const { dateRange } = useDashboard()

  return <CombinedAdvertisingDashboard dateRange={dateRange} />
}