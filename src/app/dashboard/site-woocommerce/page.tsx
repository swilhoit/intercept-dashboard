"use client"

import { useState, useEffect, Suspense } from "react"
import { DateRange } from "react-day-picker"
import { subDays } from "date-fns"
import { useSearchParams } from "next/navigation"
import { WebsitesDashboard } from "@/components/dashboard/site-woocommerce"

function SiteWooCommerceContent() {
  const [siteData, setSiteData] = useState<any>(null)
  const [trafficData, setTrafficData] = useState<any>(null)
  const [searchConsoleData, setSearchConsoleData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()

  const getDateRange = (): DateRange | undefined => {
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    if (startDate && endDate) {
      return {
        from: new Date(startDate),
        to: new Date(endDate),
      }
    }
    
    return {
      from: subDays(new Date(), 7),
      to: new Date(),
    }
  }

  const [dateRange] = useState<DateRange | undefined>(getDateRange())

  useEffect(() => {
    fetchSiteData()
  }, [dateRange])

  const fetchSiteData = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }

    try {
      const [siteRes, trafficRes, searchRes] = await Promise.all([
        fetch(`/api/sites/woocommerce?${params}`),
        fetch(`/api/analytics/traffic?${params}`),
        fetch(`/api/search-console/overview?${params}`)
      ])

      const [siteInfo, trafficInfo, searchInfo] = await Promise.all([
        siteRes.json(),
        trafficRes.json(),
        searchRes.json()
      ])

      setSiteData(siteInfo)
      setTrafficData(trafficInfo)
      setSearchConsoleData(searchInfo)
    } catch (error) {
      console.error("Error fetching site data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <WebsitesDashboard
      salesData={siteData}
      productData={siteData?.products || []}
      categoryData={siteData?.categories || []}
      trafficData={trafficData}
      searchConsoleData={searchConsoleData}
      startDate={dateRange?.from?.toISOString().split("T")[0] || ''}
      endDate={dateRange?.to?.toISOString().split("T")[0] || ''}
    />
  )
}

export default function SiteWooCommercePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">Loading...</div>}>
      <SiteWooCommerceContent />
    </Suspense>
  )
}