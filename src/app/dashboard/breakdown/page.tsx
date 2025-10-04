"use client"

import { useState, useEffect } from "react"
import { ProductBreakdown } from "@/components/dashboard/product-breakdown"
import { useDashboard } from "../dashboard-context"

export default function BreakdownPage() {
  const { dateRange, selectedChannel } = useDashboard()
  const [data, setData] = useState<any>({ breakdown: [], summary: [], totalProducts: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedChannel])

  const fetchData = async () => {
    setLoading(true)
    
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

    try {
      const response = await fetch(`/api/sales/product-breakdown?${params}`)
      const result = await response.json()
      setData(result.error ? { breakdown: [], summary: [], totalProducts: 0 } : result)
    } catch (error) {
      console.error("Error fetching breakdown data:", error)
      setData({ breakdown: [], summary: [], totalProducts: 0 })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return <ProductBreakdown data={data} loading={loading} />
}

