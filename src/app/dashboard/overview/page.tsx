"use client"

import { useMemo } from "react"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { SalesChartWithToggle } from "@/components/dashboard/sales-chart-with-toggle"
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown"
import { ProductTable } from "@/components/dashboard/product-table"
import { useDashboard } from "../dashboard-context"
import { validateSummaryData } from "@/lib/data-validation"
import { useCachedFetchMultiple } from "@/hooks/use-cached-fetch"

export default function OverviewPage() {
  const { dateRange, selectedChannel } = useDashboard()

  // Build API URLs with parameters
  const apiUrls = useMemo(() => {
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

    const paramString = params.toString()

    return [
      // Critical data (stats cards) - loads first
      { url: `/api/sales/summary?${paramString}`, critical: true, ttl: 60000 },
      { url: `/api/ads/total-spend?${paramString}`, critical: true, ttl: 60000 },
      { url: `/api/amazon/daily-sales?${paramString}`, critical: true, ttl: 60000 },
      { url: `/api/sites/woocommerce?${paramString}`, critical: true, ttl: 60000 },

      // Secondary data (charts/tables) - loads in background
      { url: `/api/sales/products?${paramString}`, critical: false, ttl: 120000 },
      { url: `/api/sales/categories?${paramString}`, critical: false, ttl: 120000 },
    ]
  }, [dateRange, selectedChannel])

  const { data, criticalLoading, loading } = useCachedFetchMultiple(apiUrls)

  // Extract data from responses
  const summaryData = data[apiUrls[0].url] || { current_period: {} }
  const adSpendData = data[apiUrls[1].url] || { metrics: {} }
  const amazonDailyData = data[apiUrls[2].url] || []
  const sitesData = data[apiUrls[3].url] || { siteBreakdown: [] }
  const productsData = data[apiUrls[4].url] || []
  const categoriesData = data[apiUrls[5].url] || { categories: {} }

  // Calculate accurate totals
  const currentPeriod = summaryData.current_period || {}
  const validatedData = validateSummaryData(currentPeriod)

  const siteBreakdownTotal = (sitesData.siteBreakdown || []).reduce(
    (sum: number, site: any) => sum + (site.revenue || 0),
    0
  )

  const accurateAmazonRevenue = Array.isArray(amazonDailyData)
    ? amazonDailyData.reduce((sum: number, day: any) => sum + (day.total_sales || 0), 0)
    : 0

  const accurateTotalRevenue = accurateAmazonRevenue + siteBreakdownTotal

  const summary = summaryData.error
    ? validateSummaryData({})
    : ({
        ...validatedData,
        amazon_revenue: accurateAmazonRevenue,
        total_revenue: accurateTotalRevenue,
        percentage_changes: summaryData.percentage_changes,
        has_comparison: summaryData.has_comparison,
      } as any)

  const adSpendInfo = adSpendData.error ? { metrics: {} } : adSpendData

  // Build site breakdown
  const siteBreakdown = useMemo(() => {
    const sites = []

    // Add Amazon
    if (accurateAmazonRevenue > 0) {
      sites.push({
        site: "Amazon",
        revenue: accurateAmazonRevenue,
        color: "#FF9500",
      })
    }

    // Add WooCommerce/Shopify sites
    if (sitesData.siteBreakdown) {
      sitesData.siteBreakdown.forEach((site: any) => {
        let color = "#7B68EE"
        if (site.site === "WaterWise") color = "#5AC8FA"
        else if (site.site === "WaterWise (Shopify)") color = "#007AFF"
        else if (site.site === "BrickAnew") color = "#AF52DE"
        else if (site.site === "Heatilator") color = "#FF2D55"
        else if (site.site === "Superior") color = "#32D74B"
        else if (site.site === "Majestic") color = "#FFD60A"

        sites.push({
          ...site,
          color: color,
        })
      })
    }

    return sites
  }, [accurateAmazonRevenue, sitesData.siteBreakdown])

  const products = Array.isArray(productsData) ? productsData : []
  const categories = categoriesData.error ? {} : categoriesData.categories || {}

  return (
    <>
      {criticalLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-sm text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      ) : (
        <>
          <StatsCards
            totalRevenue={summary.total_revenue}
            avgDailySales={summary.avg_daily_sales}
            daysWithSales={summary.days_with_sales}
            highestDay={summary.highest_day || 0}
            totalAdSpend={adSpendInfo.metrics?.totalAdSpend || 0}
            tacos={
              adSpendInfo.metrics?.totalAdSpend && summary.total_revenue > 0
                ? (adSpendInfo.metrics.totalAdSpend / summary.total_revenue) * 100
                : 0
            }
            organicClicks={summary.organic_clicks}
            percentageChanges={{
              total_revenue: summary.percentage_changes?.total_revenue,
              avg_daily_sales: summary.percentage_changes?.avg_daily_sales,
              totalAdSpend: adSpendInfo.metrics?.percentage_changes?.totalAdSpend,
              organicClicks: summary.percentage_changes?.organicClicks,
            }}
            hasComparison={summary.has_comparison || adSpendInfo.metrics?.has_comparison}
          />
        </>
      )}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        <div className="col-span-full lg:col-span-4">
          <SalesChartWithToggle
            dateRange={dateRange}
            channel={selectedChannel === "all" ? undefined : selectedChannel}
          />
        </div>
        <div className="col-span-full lg:col-span-3">
          <CategoryBreakdown categories={categories} loading={loading} />
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
                <span className="text-sm font-mono">
                  $
                  {(site.revenue || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center font-semibold">
                <span className="text-sm">Total Revenue</span>
                <span className="text-sm font-mono">
                  $
                  {siteBreakdown
                    .reduce((sum, site) => sum + (site.revenue || 0), 0)
                    .toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Orders</span>
              <span className="text-sm font-mono">
                {(summary.total_orders || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Avg Daily Sales</span>
              <span className="text-sm font-mono">
                ${(summary.avg_daily_sales || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Days with Sales</span>
              <span className="text-sm font-mono">{summary.days_with_sales || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Ad Spend</span>
              <span className="text-sm font-mono">
                ${(adSpendInfo.metrics?.totalAdSpend || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ProductTable products={products.slice(0, 25)} />
    </>
  )
}
