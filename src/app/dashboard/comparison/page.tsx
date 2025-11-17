"use client"

import { useState, useEffect, useMemo } from "react"
import { ProductComparison } from "@/components/dashboard/product-comparison"
import { useDashboard } from "../dashboard-context"
import { useCachedFetch } from "@/hooks/use-cached-fetch"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"

export default function ComparisonPage() {
  const { dateRange, selectedChannel } = useDashboard()

  // Build API URL
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }
    if (selectedChannel !== "all") {
      params.append("channel", selectedChannel)
    }
    return `/api/sales/products?${params.toString()}`
  }, [dateRange, selectedChannel])

  const { data, loading } = useCachedFetch<any[]>(apiUrl, { ttl: 120000 })

  if (loading) {
    return <DashboardSkeleton />
  }

  return <ProductComparison data={data || []} dateRange={dateRange} />
}

