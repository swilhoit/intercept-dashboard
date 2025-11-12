"use client"

import { useState, useEffect } from "react"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { SalesChartWithToggle } from "@/components/dashboard/sales-chart-with-toggle"
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown"
import { ProductTable } from "@/components/dashboard/product-table"
import { useDashboard } from "../dashboard-context"
import { validateSummaryData } from "@/lib/data-validation"

export default function OverviewPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>({})
  const [products, setProducts] = useState<any[]>([])
  const [adSpendData, setAdSpendData] = useState<any>({ metrics: {} })
  const [categories, setCategories] = useState<any>({})
  const [siteBreakdown, setSiteBreakdown] = useState<any[]>([])
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
      const [summaryRes, productsRes, adSpendRes, categoriesRes, sitesRes, amazonDailyRes] = await Promise.all([
        fetch(`/api/sales/summary?${params}`),
        fetch(`/api/sales/products?${params}`),
        fetch(`/api/ads/total-spend?${params}`),
        fetch(`/api/sales/categories?${params}`),
        fetch(`/api/sites/woocommerce?${params}`),
        fetch(`/api/amazon/daily-sales?${params}`),
      ])

      const [summaryData, productsData, adSpendInfo, categoriesData, sitesData, amazonDailyData] = await Promise.all([
        summaryRes.json(),
        productsRes.json(),
        adSpendRes.json(),
        categoriesRes.json(),
        sitesRes.json(),
        amazonDailyRes.json(),
      ])

      // Calculate accurate Amazon revenue from direct API
      const accurateAmazonRevenue = Array.isArray(amazonDailyData)
        ? amazonDailyData.reduce((sum: number, day: any) => sum + (day.total_sales || 0), 0)
        : 0

      // Extract and validate current_period from the API response
      const currentPeriod = summaryData.current_period || {}
      const validatedData = validateSummaryData(currentPeriod)

      // Calculate accurate total revenue using direct Amazon data + WooCommerce + Shopify
      const woocommerceRevenue = validatedData.woocommerce_revenue || 0
      const shopifyRevenue = validatedData.shopify_revenue || 0
      const accurateTotalRevenue = accurateAmazonRevenue + woocommerceRevenue + shopifyRevenue

      setSummary(summaryData.error ? validateSummaryData({}) : {
        ...validatedData,
        amazon_revenue: accurateAmazonRevenue,
        total_revenue: accurateTotalRevenue,
        percentage_changes: summaryData.percentage_changes,
        has_comparison: summaryData.has_comparison
      })

      // Safely handle products data
      if (Array.isArray(productsData)) {
        setProducts(productsData)
      } else if (productsData && !productsData.error) {
        setProducts([])
      } else {
        setProducts([])
      }
      setAdSpendData(adSpendInfo.error ? {
        metrics: {},
      } : adSpendInfo)

      // Set category data
      setCategories(categoriesData.error ? {} : categoriesData.categories || {})

      // Build site breakdown - combine all channels
      const sites = []

      // Add Amazon (using accurate revenue calculated above)
      if (accurateAmazonRevenue > 0) {
        sites.push({
          site: 'Amazon',
          revenue: accurateAmazonRevenue,
          color: '#FF9500'
        })
      }

      // Add WooCommerce sites from siteBreakdown
      if (sitesData.siteBreakdown) {
        sitesData.siteBreakdown.forEach((site: any) => {
          // Assign colors to each site
          let color = '#7B68EE' // Default purple
          if (site.site === 'WaterWise') color = '#5AC8FA' // Cyan
          else if (site.site === 'BrickAnew') color = '#AF52DE' // Purple
          else if (site.site === 'Heatilator') color = '#FF2D55' // Pink
          else if (site.site === 'Superior') color = '#32D74B' // Green
          else if (site.site === 'Majestic') color = '#FFD60A' // Yellow

          sites.push({
            ...site,
            color: color
          })
        })
      }

      setSiteBreakdown(sites)

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
          <CategoryBreakdown
            categories={categories}
            loading={loading}
          />
        </div>
      </div>
      
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <div className="bg-white rounded-lg border shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Site & Channel Breakdown</h3>
          <div className="space-y-3">
            {siteBreakdown.map((site) => (
              <div key={site.site} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: site.color }}
                  ></div>
                  <span className="text-sm font-medium">{site.site}</span>
                </div>
                <span className="text-sm font-mono">${(site.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center font-semibold">
                <span className="text-sm">Total Revenue</span>
                <span className="text-sm font-mono">${siteBreakdown.reduce((sum, site) => sum + (site.revenue || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
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