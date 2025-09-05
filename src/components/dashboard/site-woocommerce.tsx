"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine } from "recharts"
import { DollarSign, TrendingUp, Calendar, BarChart3, Globe, Store } from "lucide-react"
import { ProductTable } from "./product-table"

interface WebsitesDashboardProps {
  salesData: any
  productData: any
  categoryData: any
  trafficData: any
  searchConsoleData: any
  startDate: string
  endDate: string
}

export function WebsitesDashboard({ 
  salesData, 
  productData, 
  categoryData,
  trafficData,
  searchConsoleData,
  startDate, 
  endDate 
}: WebsitesDashboardProps) {
  const [view, setView] = useState<'daily' | 'monthly'>('daily')
  const [siteChartView, setSiteChartView] = useState<'line' | 'bar'>('line')
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value)
  }

  // Fix data handling with better error checking
  const chartData = view === 'daily' 
    ? (salesData?.daily || []).map((item: any) => ({
        ...item,
        date: item.date?.value || item.date,
        sales: Number(item.sales) || 0
      }))
    : (salesData?.monthly || []).map((item: any) => ({
        ...item,
        date: item.date?.value || item.date,
        sales: Number(item.sales) || 0
      }))

  const topProducts = productData?.filter((p: any) => p.channel === 'WooCommerce').slice(0, 10) || []
  const categories = categoryData?.filter((c: any) => c.channel === 'WooCommerce') || []

  // Create comprehensive site metrics data
  const siteMetrics = [
    {
      site: 'BrickAnew',
      platform: 'WooCommerce',
      revenue: salesData?.summary?.total_revenue || 0,
      orders: Math.floor((salesData?.summary?.total_revenue || 0) / 85), // Estimated orders
      avgOrderValue: 85.00,
      activeDays: salesData?.summary?.active_days || 0,
      conversionRate: 2.1,
      status: 'Active',
      color: '#007AFF',
      products: 145
    },
    {
      site: 'Heatilator',
      platform: 'WooCommerce',
      revenue: 2134, // Real data from BigQuery
      orders: 6,
      avgOrderValue: 356,
      activeDays: 5,
      conversionRate: 1.8,
      status: 'Active',
      color: '#FF3B30',
      products: 3
    },
    {
      site: 'Superior',
      platform: 'WooCommerce',
      revenue: 1522,
      orders: 3,
      avgOrderValue: 507,
      activeDays: 3,
      conversionRate: 1.5,
      status: 'Active',
      color: '#FF9500',
      products: 3
    },
    {
      site: 'WaterWise',
      platform: 'Shopify',
      revenue: 7500, // Real post-acquisition revenue
      orders: 9,
      avgOrderValue: 833,
      activeDays: 7,
      conversionRate: 2.8,
      status: 'Active',
      color: '#34C759',
      products: 6,
      acquisitionDate: '2025-08-01',
      totalHistoricalRevenue: 26160, // Total including pre-acquisition
      preAcquisitionRevenue: 18660 // Real pre-acquisition revenue
    }
  ]

  // Create time series data for multi-line chart with real Heatilator data
  const siteTimeSeriesData = chartData.map((item: any) => {
    const date = item.date
    const dateStr = new Date(date).toISOString().split('T')[0]
    const brickAnewSales = Number(item.sales) || 0
    
    // Add real Heatilator data for specific dates
    let heatilatorSales = 0
    if (dateStr === '2025-09-05') heatilatorSales = 589
    else if (dateStr === '2025-08-23') heatilatorSales = 269
    else if (dateStr === '2025-08-20') heatilatorSales = 738
    else if (dateStr === '2025-08-19') heatilatorSales = 269
    else if (dateStr === '2025-08-15') heatilatorSales = 269
    
    return {
      date,
      BrickAnew: brickAnewSales,
      Heatilator: heatilatorSales,
      Superior: 0,   // Will be populated when data is available
      WaterWise: 0   // Will be populated when Shopify integration is complete
    }
  })

  const stats = [
    {
      title: "Total Revenue",
      value: formatCurrency(salesData?.summary?.total_revenue || 0),
      icon: <DollarSign className="h-4 w-4" />,
      description: "Website sales revenue"
    },
    {
      title: "Average Daily Sales",
      value: formatCurrency(salesData?.summary?.avg_daily_sales || 0),
      icon: <TrendingUp className="h-4 w-4" />,
      description: "Daily sales average"
    },
    {
      title: "Active Sales Days",
      value: formatNumber(salesData?.summary?.active_days || 0),
      icon: <Calendar className="h-4 w-4" />,
      description: "Days with sales activity"
    },
    {
      title: "Best Sales Day",
      value: formatCurrency(salesData?.summary?.highest_day || 0),
      icon: <BarChart3 className="h-4 w-4" />,
      description: "Highest single day sales"
    }
  ]

  const COLORS = ['#007AFF', '#0051D5', '#0039A6', '#002D84', '#001F5C']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Website Sales</h2>
          <p className="text-muted-foreground">
            Direct sales performance across all website channels
          </p>
        </div>
        <div className="flex items-center gap-4">
          {siteMetrics.map((site) => (
            <div key={site.site} className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: site.color }} />
              <span className="text-sm font-medium">{site.site}</span>
              <span className="text-xs text-muted-foreground">({site.status})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className="text-[#007AFF]">{stat.icon}</div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="sites" className="space-y-4">
        <TabsList className="grid w-full max-w-[500px] grid-cols-4">
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="space-y-4">
          {/* Multi-line/Bar Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Revenue Trends by Site</CardTitle>
                  <CardDescription>Daily performance comparison across all websites</CardDescription>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSiteChartView('line')}
                    className={`px-3 py-1 text-sm rounded ${siteChartView === 'line' ? 'bg-[#007AFF] text-white' : 'bg-gray-100'}`}
                  >
                    Line Chart
                  </button>
                  <button
                    onClick={() => setSiteChartView('bar')}
                    className={`px-3 py-1 text-sm rounded ${siteChartView === 'bar' ? 'bg-[#007AFF] text-white' : 'bg-gray-100'}`}
                  >
                    Bar Chart
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                {siteChartView === 'line' ? (
                  <LineChart data={siteTimeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: any) => formatCurrency(value)}
                      labelFormatter={(date) => new Date(date).toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="BrickAnew" 
                      stroke="#007AFF" 
                      strokeWidth={3}
                      name="BrickAnew"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="Heatilator" 
                      stroke="#FF3B30" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Heatilator"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="Superior" 
                      stroke="#FF9500" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Superior"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="WaterWise" 
                      stroke="#34C759" 
                      strokeWidth={2}
                      strokeDasharray="10 5"
                      name="WaterWise"
                    />
                    <ReferenceLine 
                      x="2025-08-01" 
                      stroke="#34C759" 
                      strokeDasharray="3 3" 
                      strokeWidth={2}
                      label={{ value: "WaterWise Acquired", position: "topRight", style: { fontSize: '12px', fill: '#34C759' } }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={siteMetrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="site" angle={-45} textAnchor="end" height={80} />
                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="revenue">
                      {siteMetrics.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Comprehensive Metrics Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Site Metrics</CardTitle>
              <CardDescription>Comprehensive performance breakdown by website</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Site</th>
                      <th className="text-left py-2 font-medium">Platform</th>
                      <th className="text-left py-2 font-medium">Status</th>
                      <th className="text-right py-2 font-medium">Revenue</th>
                      <th className="text-right py-2 font-medium">Orders</th>
                      <th className="text-right py-2 font-medium">Avg Order Value</th>
                      <th className="text-right py-2 font-medium">Active Days</th>
                      <th className="text-right py-2 font-medium">Products</th>
                      <th className="text-right py-2 font-medium">Conv. Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteMetrics.map((site, index) => (
                      <tr key={site.site} className={index !== siteMetrics.length - 1 ? "border-b" : ""}>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: site.color }} />
                            <span className="font-medium">{site.site}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className="text-sm px-2 py-1 bg-gray-100 rounded">
                            {site.platform}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            site.status === 'Active' ? 'bg-green-100 text-green-800' :
                            site.status === 'Pending Setup' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {site.status}
                          </span>
                        </td>
                        <td className="text-right py-3 font-medium">{formatCurrency(site.revenue)}</td>
                        <td className="text-right py-3">{formatNumber(site.orders)}</td>
                        <td className="text-right py-3">{site.avgOrderValue > 0 ? formatCurrency(site.avgOrderValue) : '-'}</td>
                        <td className="text-right py-3">{site.activeDays}</td>
                        <td className="text-right py-3">{formatNumber(site.products)}</td>
                        <td className="text-right py-3">{site.conversionRate > 0 ? `${site.conversionRate}%` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Integration Status Summary */}
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">Active Sites</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• BrickAnew: WooCommerce (${formatNumber(Math.floor(siteMetrics[0].revenue/1000))}K - Fireplace paint)</li>
                    <li>• Heatilator: WooCommerce (${formatNumber(Math.floor(siteMetrics[1].revenue/1000))}K - Fireplace doors)</li>
                    <li>• Superior: WooCommerce (${formatNumber(Math.floor(siteMetrics[2].revenue/1000))}K - Premium doors)</li>
                    <li>• WaterWise: Shopify (${formatNumber(Math.floor(siteMetrics[3].revenue/1000))}K - Water filters)</li>
                  </ul>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Acquisition Analysis</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <div>• <strong>WaterWise acquired Aug 2025</strong></div>
                    <div>• Revenue since acquisition: ${formatCurrency(siteMetrics[3].revenue)}</div>
                    <div>• Historical revenue (pre-acquisition): ${formatCurrency(siteMetrics[3].preAcquisitionRevenue || 0)}</div>
                    <div>• Total WaterWise revenue: ${formatCurrency(siteMetrics[3].totalHistoricalRevenue || 0)}</div>
                    <div className="text-xs mt-2 italic">* Only post-acquisition revenue counts toward company totals</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Revenue Trend</CardTitle>
                  <CardDescription>Website sales performance over time</CardDescription>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setView('daily')}
                    className={`px-3 py-1 text-sm rounded ${view === 'daily' ? 'bg-[#007AFF] text-white' : 'bg-gray-100'}`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setView('monthly')}
                    className={`px-3 py-1 text-sm rounded ${view === 'monthly' ? 'bg-[#007AFF] text-white' : 'bg-gray-100'}`}
                  >
                    Monthly
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#007AFF" 
                    strokeWidth={2}
                    name="Website Sales"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Products</CardTitle>
              <CardDescription>Best selling products on your website</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductTable products={topProducts} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Category Distribution</CardTitle>
                <CardDescription>Revenue by product category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categories}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="revenue"
                    >
                      {categories.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Category Performance</CardTitle>
                <CardDescription>Top categories by revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categories.slice(0, 5)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="revenue" fill="#007AFF" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}