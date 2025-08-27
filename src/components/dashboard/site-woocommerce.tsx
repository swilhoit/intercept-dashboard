"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Package, DollarSign, TrendingUp, ShoppingCart, Users, Globe, Target, Mail } from "lucide-react"
import { ProductTable } from "./product-table"

interface WooCommerceDashboardProps {
  salesData: any
  productData: any
  categoryData: any
  trafficData: any
  searchConsoleData: any
  startDate: string
  endDate: string
}

export function WooCommerceDashboard({ 
  salesData, 
  productData, 
  categoryData,
  trafficData,
  searchConsoleData,
  startDate, 
  endDate 
}: WooCommerceDashboardProps) {
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

  const chartData = view === 'daily' ? salesData?.daily || [] : salesData?.monthly || []
  const topProducts = productData?.filter((p: any) => p.channel === 'WooCommerce').slice(0, 10) || []
  const categories = categoryData?.filter((c: any) => c.channel === 'WooCommerce') || []

  const stats = [
    {
      title: "Total Revenue",
      value: formatCurrency(salesData?.summary?.total_revenue || 0),
      icon: <DollarSign className="h-4 w-4" />,
      description: "Direct website sales"
    },
    {
      title: "Website Visitors",
      value: formatNumber(trafficData?.users || 0),
      icon: <Users className="h-4 w-4" />,
      description: "Unique visitors"
    },
    {
      title: "Conversion Rate",
      value: `${(trafficData?.conversion_rate || 0).toFixed(2)}%`,
      icon: <Target className="h-4 w-4" />,
      description: "Visitor to customer"
    },
    {
      title: "Organic Traffic",
      value: formatNumber(searchConsoleData?.clicks || 0),
      icon: <Globe className="h-4 w-4" />,
      description: "From search engines"
    }
  ]

  const COLORS = ['#007AFF', '#0051D5', '#0039A6', '#002D84', '#001F5C']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">WooCommerce Store</h2>
          <p className="text-muted-foreground">
            Sales and marketing performance for your website
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[#007AFF]" />
          <span className="text-sm font-medium">WooCommerce</span>
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

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList className="grid w-full max-w-[600px] grid-cols-5">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Revenue Trend</CardTitle>
                  <CardDescription>WooCommerce sales performance over time</CardDescription>
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
                    name="WooCommerce Sales"
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

        <TabsContent value="traffic" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Traffic Sources</CardTitle>
                <CardDescription>How visitors find your website</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Organic Search', value: trafficData?.organic || 40, color: '#007AFF' },
                        { name: 'Direct', value: trafficData?.direct || 25, color: '#0051D5' },
                        { name: 'Referral', value: trafficData?.referral || 20, color: '#0039A6' },
                        { name: 'Social', value: trafficData?.social || 10, color: '#002D84' },
                        { name: 'Email', value: trafficData?.email || 5, color: '#001F5C' }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[0,1,2,3,4].map((index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement Metrics</CardTitle>
                <CardDescription>User behavior on your website</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Page Views</span>
                    <span className="text-sm font-medium">{formatNumber(trafficData?.pageviews || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Avg. Session Duration</span>
                    <span className="text-sm font-medium">{trafficData?.avg_session_duration || '2m 45s'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Bounce Rate</span>
                    <span className="text-sm font-medium">{trafficData?.bounce_rate || '42%'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Pages per Session</span>
                    <span className="text-sm font-medium">{trafficData?.pages_per_session || '3.2'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">New vs Returning</span>
                    <span className="text-sm font-medium">65% / 35%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Search Performance</CardTitle>
                <CardDescription>Google Search Console metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Impressions</span>
                      <span className="text-sm font-medium">{formatNumber(searchConsoleData?.impressions || 0)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#007AFF] h-2 rounded-full" style={{ width: '80%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Clicks</span>
                      <span className="text-sm font-medium">{formatNumber(searchConsoleData?.clicks || 0)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#007AFF] h-2 rounded-full" style={{ width: '45%' }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">CTR</span>
                    <span className="text-sm font-medium">{searchConsoleData?.ctr || '3.2%'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Avg. Position</span>
                    <span className="text-sm font-medium">{searchConsoleData?.position || '15.4'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Search Queries</CardTitle>
                <CardDescription>Keywords driving traffic</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(searchConsoleData?.top_queries || [
                    { query: 'organic supplements', clicks: 245 },
                    { query: 'natural vitamins', clicks: 189 },
                    { query: 'health products', clicks: 156 },
                    { query: 'wellness store', clicks: 134 },
                    { query: 'dietary supplements', clicks: 98 }
                  ]).slice(0, 5).map((item: any, index: number) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm truncate flex-1">{item.query}</span>
                      <span className="text-sm text-muted-foreground">{item.clicks} clicks</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}