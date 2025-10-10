"use client"

import { useState, useEffect } from "react"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { SalesChartWithToggle } from "@/components/dashboard/sales-chart-with-toggle"
import { ChannelBreakdown } from "@/components/dashboard/channel-breakdown"
import { ProductTable } from "@/components/dashboard/product-table"
import { useDashboard } from "../dashboard-context"

export default function OverviewPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>({})
  const [products, setProducts] = useState<any[]>([])
  const [adSpendData, setAdSpendData] = useState<any>({ metrics: {} })
  const { dateRange, selectedChannel } = useDashboard()

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

      // Debug logging to see what we're actually getting
      console.log('🔍 API Response Debug:')
      console.log('Summary Data:', summaryData)
      console.log('WooCommerce Revenue:', summaryData.woocommerce_revenue)
      console.log('Amazon Revenue:', summaryData.amazon_revenue)
      console.log('Total Revenue:', summaryData.total_revenue)
      console.log('Has Error:', !!summaryData.error)

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
        organicClicks={summary.organic_clicks}
        percentageChanges={{
          total_revenue: summary.percentage_changes?.total_revenue,
          avg_daily_sales: summary.percentage_changes?.avg_daily_sales,
          totalAdSpend: adSpendData.metrics?.percentage_changes?.totalAdSpend,
          organicClicks: summary.percentage_changes?.organicClicks
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
      
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <div className="bg-white rounded-lg border shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Site Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF9500]"></div>
                <span className="text-sm font-medium">Amazon</span>
              </div>
              <span className="text-sm font-mono">${(summary.amazon_revenue || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#7B68EE]"></div>
                <span className="text-sm font-medium">WooCommerce</span>
              </div>
              <span className="text-sm font-mono">${(summary.woocommerce_revenue || 0).toLocaleString()}</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center font-semibold">
                <span className="text-sm">Total Revenue</span>
                <span className="text-sm font-mono">${(summary.total_revenue || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Orders</span>
              <span className="text-sm font-mono">{(summary.total_orders || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Avg Daily Sales</span>
              <span className="text-sm font-mono">${(summary.avg_daily_sales || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Days with Sales</span>
              <span className="text-sm font-mono">{summary.days_with_sales || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Ad Spend</span>
              <span className="text-sm font-mono">${(adSpendData.metrics?.totalAdSpend || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
      
      <ProductTable products={products.slice(0, 25)} />
    </>
  )
}