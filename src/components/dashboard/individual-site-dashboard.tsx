"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Package, DollarSign, TrendingUp, ShoppingCart } from "lucide-react"
import { ProductTable } from "./product-table"
import { formatCurrency, formatNumber } from "@/lib/utils"

interface IndividualSiteDashboardProps {
  siteName: string
  siteColor: string
  salesData: any
  productData: any
}

export function IndividualSiteDashboard({
  siteName,
  siteColor,
  salesData,
  productData
}: IndividualSiteDashboardProps) {
  const chartData = salesData?.daily || []
  const topProducts = productData?.slice(0, 10) || []

  const stats = [
    {
      title: "Total Revenue",
      value: formatCurrency(salesData?.summary?.total_revenue || 0),
      icon: <DollarSign className="h-4 w-4" />,
      description: `${siteName} sales`
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
      icon: <TrendingUp className="h-4 w-4" />,
      description: "Products with sales"
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: siteColor }} />
        <span className="text-sm font-medium">{siteName}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div style={{ color: siteColor }}>{stat.icon}</div>
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
          <CardTitle>Revenue Trend</CardTitle>
          <CardDescription>Daily sales performance</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }}
              />
              <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
              <Line
                type="monotone"
                dataKey="sales"
                stroke={siteColor}
                strokeWidth={2}
                name={`${siteName} Sales`}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Products</CardTitle>
          <CardDescription>Best selling products on {siteName}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductTable products={topProducts} />
        </CardContent>
      </Card>
    </div>
  )
}
