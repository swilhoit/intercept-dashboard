"use client"

import { useState, useEffect, Suspense } from "react"
import { DateRange } from "react-day-picker"
import { subDays } from "date-fns"
import { useSearchParams } from "next/navigation"
import { AmazonDashboard } from "@/components/dashboard/site-amazon"

function SiteAmazonContent() {
  const [siteData, setSiteData] = useState<any>(null)
  const [trafficData, setTrafficData] = useState<any>(null)
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
      // Fetch data from Amazon APIs
      const [dailySalesRes, productsRes, trafficRes] = await Promise.all([
        fetch(`/api/amazon/daily-sales?${params}`),
        fetch(`/api/amazon/products?${params}`),
        fetch(`/api/analytics/traffic?${params}`)
      ])

      // Handle failed API responses gracefully
      const [dailySales, products, trafficInfo] = await Promise.all([
        dailySalesRes.ok ? dailySalesRes.json().catch(() => []) : [],
        productsRes.ok ? productsRes.json().catch(() => []) : [],
        trafficRes.ok ? trafficRes.json().catch(() => ({})) : {}
      ])

      // Ensure data arrays are valid before processing
      const validDailySales = Array.isArray(dailySales) ? dailySales : []
      const validProducts = Array.isArray(products) ? products : []

      // Transform data to match expected format
      const amazonSiteData = {
        summary: {
          total_revenue: validDailySales.reduce((sum: number, day: any) => sum + (day.total_sales || 0), 0),
          total_units: validDailySales.reduce((sum: number, day: any) => sum + (day.order_count || 0), 0),
          avg_order_value: validDailySales.length > 0 
            ? validDailySales.reduce((sum: number, day: any) => sum + (day.avg_order_value || 0), 0) / validDailySales.length
            : 0
        },
        daily: validDailySales.map((day: any) => ({
          date: day.date?.value || day.date,
          sales: day.total_sales || 0
        })),
        products: validProducts.map((product: any) => ({
          product_name: product.product_name,
          total_sales: product.total_sales,
          quantity: product.order_count,
          channel: 'Amazon'
        })),
        categories: []
      }

      setSiteData(amazonSiteData)
      setTrafficData(trafficInfo)
    } catch (error) {
      console.error("Error fetching Amazon site data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <AmazonDashboard
      salesData={siteData}
      productData={siteData?.products || []}
      categoryData={siteData?.categories || []}
      trafficData={trafficData}
      startDate={dateRange?.from?.toISOString().split("T")[0] || ''}
      endDate={dateRange?.to?.toISOString().split("T")[0] || ''}
    />
  )
}

export default function SiteAmazonPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">Loading...</div>}>
      <SiteAmazonContent />
    </Suspense>
  )
}