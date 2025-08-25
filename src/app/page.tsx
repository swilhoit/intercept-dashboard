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
import { AdvertisingDashboard } from "@/components/dashboard/advertising-dashboard"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })
  const [selectedChannel, setSelectedChannel] = useState<string>("all")
  const router = useRouter()
  const [dailySales, setDailySales] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({})
  const [products, setProducts] = useState<any[]>([])
  const [productBreakdown, setProductBreakdown] = useState<any>({ breakdown: [], summary: [], totalProducts: 0 })
  const [groupBy, setGroupBy] = useState<string>("daily")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [adSpendData, setAdSpendData] = useState<any>({ metrics: {}, trend: [] })

  useEffect(() => {
    fetchData()
  }, [dateRange, selectedChannel, groupBy, categoryFilter])

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

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <h2 className="text-3xl font-bold tracking-tight">Sales Dashboard</h2>
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

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="breakdown">Product Breakdown</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
            <TabsTrigger value="advertising">Advertising</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <StatsCards
              totalRevenue={summary.total_revenue}
              avgDailySales={summary.avg_daily_sales}
              daysWithSales={summary.days_with_sales}
              highestDay={summary.highest_day}
              totalAdSpend={adSpendData.metrics?.totalAdSpend || 0}
              tacos={(adSpendData.metrics?.totalAdSpend && summary.total_revenue > 0) 
                ? (adSpendData.metrics.totalAdSpend / summary.total_revenue * 100) 
                : 0}
            />
            
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
              <div className="col-span-full lg:col-span-4">
                <SalesChartWithToggle 
                  dateRange={dateRange}
                  channel={selectedChannel}
                  title="Sales Trend"
                  description="Track your sales performance over time"
                />
              </div>
              <div className="col-span-full lg:col-span-3">
                <ChannelBreakdown
                  amazonRevenue={summary.amazon_revenue}
                  woocommerceRevenue={summary.woocommerce_revenue}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-4">
            <div className="grid gap-4 grid-cols-1">
              <ProductTableWithFilter 
                dateRange={dateRange}
                title="Top Performing Products"
                description="Products ranked by total revenue"
              />
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <CategoryAnalysis dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Detailed Product Breakdown</h3>
                <p className="text-sm text-muted-foreground">
                  Analyze product performance by unique identifiers across date ranges
                </p>
              </div>
              <div className="flex gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Fireplace Doors">Fireplace Doors</SelectItem>
                    <SelectItem value="Paint">Paint</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ProductBreakdown data={productBreakdown} loading={loading} />
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            <ProductComparison 
              data={products} 
              dateRange={dateRange}
            />
          </TabsContent>

          <TabsContent value="advertising" className="space-y-4">
            <AdvertisingDashboard dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
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
                      <span className="text-sm font-medium">Peak Sales Day</span>
                      <span className="text-sm text-muted-foreground">
                        ${(summary.highest_day || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Minimum Sales Day</span>
                      <span className="text-sm text-muted-foreground">
                        ${(summary.lowest_day || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Active Sales Days</span>
                      <span className="text-sm text-muted-foreground">
                        {summary.days_with_sales || 0} days
                      </span>
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
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Amazon</span>
                        <span className="text-sm text-muted-foreground">
                          ${(summary.amazon_revenue || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-orange-500 h-2 rounded-full"
                          style={{ 
                            width: `${((summary.amazon_revenue || 0) / Math.max(summary.total_revenue || 1, 1)) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">WooCommerce</span>
                        <span className="text-sm text-muted-foreground">
                          ${(summary.woocommerce_revenue || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ 
                            width: `${((summary.woocommerce_revenue || 0) / Math.max(summary.total_revenue || 1, 1)) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <SalesChartWithToggle 
              dateRange={dateRange}
              channel={selectedChannel}
              title="Detailed Sales Analysis"
              description="Compare channel performance over time"
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}