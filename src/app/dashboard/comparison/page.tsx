"use client"

import { useState, useEffect } from "react"
import { ProductComparison } from "@/components/dashboard/product-comparison"
import { useDashboard } from "../dashboard-context"

export default function ComparisonPage() {
  const { dateRange, selectedChannel } = useDashboard()
  const [data, setData] = useState<any[]>([])
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
      const response = await fetch(`/api/sales/products?${params}`)
      const result = await response.json()
      setData(Array.isArray(result) ? result : [])
    } catch (error) {
      console.error("Error fetching products data:", error)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return <ProductComparison data={data} dateRange={dateRange} />
}

