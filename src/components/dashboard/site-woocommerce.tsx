"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
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

  // Create site breakdown data (prepare for multi-site)
  const siteBreakdown = [
    {
      site: 'BrickAnew',
      revenue: salesData?.summary?.total_revenue || 0,
      orders: salesData?.summary?.active_days || 0,
      status: 'Active',
      color: '#007AFF'
    },
    {
      site: 'Heatilator',
      revenue: 0, // Will be populated when data is available
      orders: 0,
      status: 'Pending Setup',
      color: '#FF3B30'
    },
    {
      site: 'Superior',
      revenue: 0, // Will be populated when data is available
      orders: 0,
      status: 'Pending Setup',
      color: '#FF9500'
    },
    {
      site: 'WaterWise (Shopify)',
      revenue: 0, // Will be populated when Shopify integration is complete
      orders: 0,
      status: 'Planned',
      color: '#34C759'
    }
  ]

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
          {siteBreakdown.map((site) => (
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
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Site Performance Overview</CardTitle>
                <CardDescription>Revenue breakdown by website</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={siteBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="site" angle={-45} textAnchor="end" height={80} />
                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="revenue">
                      {siteBreakdown.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Site Status & Details</CardTitle>
                <CardDescription>Integration status for all websites</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {siteBreakdown.map((site) => (
                    <div key={site.site} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: site.color }} />
                          <span className="font-medium">{site.site}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          site.status === 'Active' ? 'bg-green-100 text-green-800' :
                          site.status === 'Pending Setup' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {site.status}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(site.revenue)}</div>
                        <div className="text-sm text-muted-foreground">{site.orders} days</div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Integration notes */}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Integration Status</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• BrickAnew: Fully integrated and active</li>
                    <li>• Heatilator & Superior: BigQuery tables created, need API credentials</li>
                    <li>• WaterWise: Planned Shopify integration</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
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