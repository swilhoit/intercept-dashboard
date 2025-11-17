'use client'

import { AmazonReturnsDashboard } from "@/components/dashboard/amazon-returns-dashboard"
import { useDashboard } from "@/app/dashboard/dashboard-context"

export default function AmazonReturnsPage() {
  const { dateRange } = useDashboard()

  // Convert DateRange format to the format expected by AmazonReturnsDashboard
  const formattedDateRange = dateRange?.from && dateRange?.to ? {
    startDate: dateRange.from.toISOString().split('T')[0],
    endDate: dateRange.to.toISOString().split('T')[0]
  } : undefined

  return <AmazonReturnsDashboard dateRange={formattedDateRange} />
}

