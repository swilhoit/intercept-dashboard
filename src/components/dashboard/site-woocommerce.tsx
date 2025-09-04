"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { DollarSign, TrendingUp, Calendar, BarChart3 } from "lucide-react"
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
          <h2 className="text-3xl font-bold tracking-tight">WooCommerce Store</h2>
          <p className="text-muted-foreground">
            Direct sales performance for your WooCommerce store
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
        <TabsList className="grid w-full max-w-[400px] grid-cols-3">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
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

      </Tabs>
    </div>
  )
}