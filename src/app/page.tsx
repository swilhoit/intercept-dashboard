"use client"

import { useState, useEffect } from "react"
import { DateRange } from "react-day-picker"
import { subDays } from "date-fns"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { SalesChart } from "@/components/dashboard/sales-chart"
import { SalesChartWithToggle } from "@/components/dashboard/sales-chart-with-toggle"
import { ProductTable } from "@/components/dashboard/product-table"
import { ProductTableWithFilter } from "@/components/dashboard/product-table-with-filter"
import { ChannelBreakdown } from "@/components/dashboard/channel-breakdown"
import { ProductBreakdown } from "@/components/dashboard/product-breakdown"
import { ProductComparison } from "@/components/dashboard/product-comparison"
import { CategoryAnalysis } from "@/components/dashboard/category-analysis"
import { CombinedAdvertisingDashboard } from "@/components/dashboard/combined-advertising-dashboard"
import { AmazonAdsReport } from "@/components/dashboard/amazon-ads-report"
import { TrafficAnalytics } from "@/components/dashboard/traffic-analytics"
import { SearchConsoleAnalytics } from "@/components/dashboard/search-console-analytics"
import { AmazonDashboard } from "@/components/dashboard/site-amazon"
import { WebsitesDashboard } from "@/components/dashboard/site-woocommerce"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7), // Reduced from 30 days to 7 for faster initial load
    to: new Date(),
  })
  const [selectedChannel, setSelectedChannel] = useState<string>("all")
  const [currentView, setCurrentView] = useState<string>("overview")
  const router = useRouter()
  const [dailySales, setDailySales] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({})
  const [products, setProducts] = useState<any[]>([])
  const [productBreakdown, setProductBreakdown] = useState<any>({ breakdown: [], summary: [], totalProducts: 0 })
  const [groupBy, setGroupBy] = useState<string>("daily")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [adSpendData, setAdSpendData] = useState<any>({ metrics: {}, trend: [] })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [siteData, setSiteData] = useState<any>(null)
  const [trafficData, setTrafficData] = useState<any>(null)
  const [searchConsoleData, setSearchConsoleData] = useState<any>(null)

  useEffect(() => {
    fetchData()
  }, [dateRange, selectedChannel, groupBy, categoryFilter])

  // Fetch site-specific data when viewing site pages
  useEffect(() => {
    if (currentView === 'site-amazon' || currentView === 'site-woocommerce') {
      fetchSiteData()
    }
  }, [currentView, dateRange])

  const fetchSiteData = async () => {
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }

    try {
      if (currentView === 'site-amazon') {
        // Fetch data from new Amazon APIs
        const [dailySalesRes, productsRes, adsRes, trafficRes] = await Promise.all([
          fetch(`/api/amazon/daily-sales?${params}`),
          fetch(`/api/amazon/products?${params}`),
          fetch(`/api/amazon/ads?${params}`),
          fetch(`/api/analytics/traffic?${params}`)
        ])

        // Handle failed API responses gracefully
        const [dailySales, products, ads, trafficInfo] = await Promise.all([
          dailySalesRes.ok ? dailySalesRes.json().catch(() => []) : [],
          productsRes.ok ? productsRes.json().catch(() => []) : [],
          adsRes.ok ? adsRes.json().catch(() => []) : [],
          trafficRes.ok ? trafficRes.json().catch(() => ({})) : {}
        ])

        // Ensure data arrays are valid before processing
        const validDailySales = Array.isArray(dailySales) ? dailySales : []
        const validProducts = Array.isArray(products) ? products : []
        const validAds = Array.isArray(ads) ? ads : []

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
          ads: validAds
        }

        setSiteData(amazonSiteData)
        setTrafficData(trafficInfo)
      } else {
        // Original WooCommerce logic
        const site = 'woocommerce'
        const [siteRes, trafficRes, searchRes] = await Promise.all([
          fetch(`/api/sites/${site}?${params}`),
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
      }
    } catch (error) {
      console.error("Error fetching site data:", error)
    }
  }

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
      const breakdownParams = new URLSearchParams(params)
      breakdownParams.append("groupBy", groupBy)
      if (categoryFilter !== "all") {
        breakdownParams.append("category", categoryFilter)
      }
      
      const [salesRes, summaryRes, productsRes, breakdownRes, adSpendRes] = await Promise.all([
        fetch(`/api/sales/daily?${params}`),
        fetch(`/api/sales/summary?${params}`),
        fetch(`/api/sales/products?${params}`),
        fetch(`/api/sales/product-breakdown?${breakdownParams}`),
        fetch(`/api/ads/total-spend?${params}`),
      ])

      const [salesData, summaryData, productsData, breakdownData, adSpendInfo] = await Promise.all([
        salesRes.json(),
        summaryRes.json(),
        productsRes.json(),
        breakdownRes.json(),
        adSpendRes.json(),
      ])

      // Handle error responses
      setDailySales(Array.isArray(salesData) ? salesData : [])
      setSummary(summaryData.error ? { 
        total_revenue: 0, 
        total_orders: 0, 
        days_with_sales: 0,
        amazon_revenue: 0,
        woocommerce_revenue: 0 
      } : summaryData)
      setProducts(Array.isArray(productsData) ? productsData : [])
      setProductBreakdown(breakdownData.error ? { 
        chartData: [], 
        categories: {} 
      } : breakdownData)
      setAdSpendData(adSpendInfo.error ? { 
        metrics: {}, 
        trend: [] 
      } : adSpendInfo)
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Get page title based on current view
  const getPageTitle = () => {
    const titles: { [key: string]: string } = {
      overview: "Sales Dashboard - Overview",
      "site-amazon": "Amazon Store",
      "site-woocommerce": "WooCommerce Store",
      products: "Product Performance",
      categories: "Category Analysis",
      breakdown: "Product Breakdown",
      comparison: "Product Comparison",
      advertising: "Advertising Dashboard",
      "amazon-ads": "Amazon Ads Report",
      traffic: "Traffic Analytics",
      "search-console": "Search Console Analytics",
      analytics: "Analytics & Metrics"
    }
    return titles[currentView] || "Sales Dashboard"
  }

  const renderContent = () => {
    switch(currentView) {
      case "overview":
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
      
      case "products":
        return <ProductTableWithFilter dateRange={dateRange} />
      
      case "categories":
        return <CategoryAnalysis dateRange={dateRange} />
      
      case "breakdown":
        return (
          <>
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-2">
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Group by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Fireplace Doors">Fireplace Doors</SelectItem>
                    <SelectItem value="Paint">Paint</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ProductBreakdown 
              data={productBreakdown}
            />
          </>
        )
      
      case "comparison":
        return (
          <ProductComparison 
            data={products} 
            dateRange={dateRange}
          />
        )
      
      case "advertising":
        return <CombinedAdvertisingDashboard dateRange={dateRange} />
      
      
      case "traffic":
        return <TrafficAnalytics dateRange={dateRange} />
      
      case "search-console":
        return <SearchConsoleAnalytics dateRange={dateRange} />
      
      case "site-amazon":
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
      
      case "site-woocommerce":
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
      
      case "analytics":
        return (
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sales Metrics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Average Order Value</span>
                    <span className="text-sm text-muted-foreground">
                      ${((summary.total_revenue || 0) / Math.max(summary.days_with_sales || 1, 1) / 50).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Conversion Rate</span>
                    <span className="text-sm text-muted-foreground">2.5%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Return Rate</span>
                    <span className="text-sm text-muted-foreground">1.2%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Channel Performance</CardTitle>
                <CardDescription>Revenue by sales channel</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Amazon Marketplace</span>
                    <span className="text-sm text-muted-foreground">
                      ${(summary.amazon_revenue || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">WooCommerce</span>
                    <span className="text-sm text-muted-foreground">
                      ${(summary.woocommerce_revenue || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Revenue</span>
                    <span className="text-sm font-bold">
                      ${(summary.total_revenue || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      
      default:
        return null
    }
  }

  return (
    <div className="flex min-h-screen">
      <SidebarNav 
        currentView={currentView} 
        onViewChange={setCurrentView}
        onCollapsedChange={setSidebarCollapsed}
      />
      
      <main className={cn(
        "flex-1 transition-all duration-300",
        sidebarCollapsed ? "md:ml-16" : "md:ml-64" // Dynamic margin based on sidebar state
      )}>
        <div className="p-8 pt-6">
          {/* Header */}
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-6">
            <h2 className="text-3xl font-bold tracking-tight ml-12 md:ml-0">
              {getPageTitle()}
            </h2>
            <div className="flex items-center space-x-2">
              <DateRangePicker date={dateRange} onDateChange={setDateRange} />
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="Amazon">Amazon</SelectItem>
                  <SelectItem value="WooCommerce">WooCommerce</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' })
                  router.push('/login')
                }}
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  )
}