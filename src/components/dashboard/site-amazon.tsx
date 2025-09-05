"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Package, DollarSign, TrendingUp, ShoppingCart, Target } from "lucide-react"
import { ProductTable } from "./product-table"

interface AmazonDashboardProps {
  salesData: any
  productData: any
  categoryData: any
  trafficData: any
  startDate: string
  endDate: string
}

export function AmazonDashboard({ 
  salesData, 
  productData, 
  categoryData,
  trafficData,
  startDate, 
  endDate 
}: AmazonDashboardProps) {
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
  const topProducts = productData?.filter((p: any) => p.channel === 'Amazon').slice(0, 10) || []
  const categories = categoryData?.filter((c: any) => c.channel === 'Amazon') || []

  const stats = [
    {
      title: "Total Revenue",
      value: formatCurrency(salesData?.summary?.total_revenue || 0),
      icon: <DollarSign className="h-4 w-4" />,
      description: "Amazon marketplace sales"
    },
    {
      title: "Products Sold",
      value: formatNumber(salesData?.summary?.total_units || 0),
      icon: <Package className="h-4 w-4" />,
      description: "Total units sold"
    },
    {
      title: "Average Order Value",
      value: formatCurrency(salesData?.summary?.avg_order_value || 0),
      icon: <ShoppingCart className="h-4 w-4" />,
      description: "Per transaction"
    },
    {
      title: "Active Products",
      value: formatNumber(topProducts.length || 0),
      icon: <Target className="h-4 w-4" />,
      description: "Products with sales"
    }
  ]

  const COLORS = ['#FF9500', '#FF6B00', '#FF8C00', '#FFB300', '#FFC700']

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="h-3 w-3 rounded-full bg-[#FF9500]" />
        <span className="text-sm font-medium">Amazon</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className="text-[#FF9500]">{stat.icon}</div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Amazon sales performance over time</CardDescription>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setView('daily')}
                className={`px-3 py-1 text-sm rounded ${view === 'daily' ? 'bg-[#FF9500] text-white' : 'bg-gray-100'}`}
              >
                Daily
              </button>
              <button
                onClick={() => setView('monthly')}
                className={`px-3 py-1 text-sm rounded ${view === 'monthly' ? 'bg-[#FF9500] text-white' : 'bg-gray-100'}`}
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
                stroke="#FF9500" 
                strokeWidth={2}
                name="Amazon Sales"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Category Analysis */}
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
                <Bar dataKey="revenue" fill="#FF9500" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Products</CardTitle>
          <CardDescription>Best selling products on Amazon</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductTable products={topProducts} />
        </CardContent>
      </Card>
    </div>
  )
}