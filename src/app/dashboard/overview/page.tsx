"use client"

import { useState, useEffect, Suspense } from "react"
import { DateRange } from "react-day-picker"
import { subDays } from "date-fns"
import { useSearchParams } from "next/navigation"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { SalesChartWithToggle } from "@/components/dashboard/sales-chart-with-toggle"
import { ChannelBreakdown } from "@/components/dashboard/channel-breakdown"
import { ProductTable } from "@/components/dashboard/product-table"

function OverviewContent() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>({})
  const [products, setProducts] = useState<any[]>([])
  const [adSpendData, setAdSpendData] = useState<any>({ metrics: {} })
  const searchParams = useSearchParams()
  
  // Get date range from URL params or use defaults
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
  const selectedChannel = searchParams.get('channel') || 'all'

  useEffect(() => {
    fetchData()
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
      const [summaryRes, productsRes, adSpendRes] = await Promise.all([
        fetch(`/api/sales/summary?${params}`),
        fetch(`/api/sales/products?${params}`),
        fetch(`/api/ads/total-spend?${params}`),
      ])

      const [summaryData, productsData, adSpendInfo] = await Promise.all([
        summaryRes.json(),
        productsRes.json(),
        adSpendRes.json(),
      ])

      setSummary(summaryData.error ? { 
        total_revenue: 0, 
        total_orders: 0, 
        days_with_sales: 0,
        amazon_revenue: 0,
        woocommerce_revenue: 0 
      } : summaryData)
      setProducts(Array.isArray(productsData) ? productsData : [])
      setAdSpendData(adSpendInfo.error ? { 
        metrics: {}, 
      } : adSpendInfo)
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <>
      <StatsCards
        totalRevenue={summary.total_revenue}
        avgDailySales={summary.avg_daily_sales}
        daysWithSales={summary.days_with_sales}
        highestDay={summary.highest_day}
        totalAdSpend={adSpendData.metrics?.totalAdSpend || 0}
        tacos={(adSpendData.metrics?.totalAdSpend && summary.total_revenue > 0) 
          ? (adSpendData.metrics.totalAdSpend / summary.total_revenue * 100) 
          : 0}
        percentageChanges={{
          total_revenue: summary.percentage_changes?.total_revenue,
          avg_daily_sales: summary.percentage_changes?.avg_daily_sales,
          totalAdSpend: adSpendData.metrics?.percentage_changes?.totalAdSpend
        }}
        hasComparison={summary.has_comparison || adSpendData.metrics?.has_comparison}
      />
      
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        <div className="col-span-full lg:col-span-4">
          <SalesChartWithToggle 
            dateRange={dateRange}
            channel={selectedChannel === "all" ? undefined : selectedChannel}
          />
        </div>
        <div className="col-span-full lg:col-span-3">
          <ChannelBreakdown 
            amazonRevenue={summary.amazon_revenue}
            woocommerceRevenue={summary.woocommerce_revenue}
          />
        </div>
      </div>
      
      <ProductTable products={products} />
    </>
  )
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">Loading...</div>}>
      <OverviewContent />
    </Suspense>
  )
}