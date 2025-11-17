'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowDownIcon, ArrowUpIcon, PackageX, TrendingDown, DollarSign, Clock } from "lucide-react"
import { useCachedFetchMultiple } from "@/hooks/use-cached-fetch"
import { formatCurrency, formatNumber, formatPercentageChange } from "@/lib/utils"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'

interface AmazonReturnsDashboardProps {
  dateRange?: {
    startDate: string
    endDate: string
  }
}

export function AmazonReturnsDashboard({ dateRange }: AmazonReturnsDashboardProps) {
  const params = new URLSearchParams()
  if (dateRange?.startDate && dateRange?.endDate) {
    params.append('startDate', dateRange.startDate)
    params.append('endDate', dateRange.endDate)
  }

  const apiUrl = `/api/amazon/returns?${params.toString()}`

  const apiUrls = useMemo(() => [
    { url: apiUrl, critical: true, ttl: 60000 },
  ], [apiUrl])

  const { data: apiData, criticalLoading, errors } = useCachedFetchMultiple(apiUrls)

  if (criticalLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-1/2 animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const returnsData = (apiData && apiData[apiUrls[0].url]) || {}
  const summary = returnsData.summary || {}
  const timeSeries = returnsData.timeSeries || []
  const topProducts = returnsData.topProducts || []
  const reasons = returnsData.reasons || []
  const categories = returnsData.categories || []

  // Calculate return rate (returns vs sales - would need sales data for accurate calculation)
  const returnRate = summary.total_returns ? (summary.total_returns / 1000 * 100).toFixed(2) : '0.00' // Placeholder calculation

  const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2']

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
            <PackageX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.total_returns || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(summary.affected_orders || 0)} affected orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Refunds</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary.total_refund_amount || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Avg: {formatCurrency(summary.avg_refund_amount || 0)} per return
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Units Returned</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.total_units_returned || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(summary.affected_products || 0)} unique products
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Days to Return</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.avg_days_to_return ? summary.avg_days_to_return.toFixed(1) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Average customer return window
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Time Series Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Returns Over Time</CardTitle>
          <CardDescription>Daily return count and refund amounts</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  year: 'numeric' 
                })}
                formatter={(value: any, name: string) => {
                  if (name === 'Refund Amount') {
                    return formatCurrency(value)
                  }
                  return formatNumber(value)
                }}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="return_count" 
                stroke="#FF6B6B" 
                name="Return Count"
                strokeWidth={2}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="refund_amount" 
                stroke="#4ECDC4" 
                name="Refund Amount"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Returned Products */}
        <Card>
          <CardHeader>
            <CardTitle>Most Returned Products</CardTitle>
            <CardDescription>Products with highest return counts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.slice(0, 10).map((product: any, index: number) => (
                <div key={product.asin} className="flex items-center">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {product.product_name || product.asin}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(product.return_count)} returns · {formatNumber(product.units_returned)} units
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-600">
                      {formatCurrency(product.total_refunds)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg: {formatCurrency(product.avg_refund)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Return Reasons */}
        <Card>
          <CardHeader>
            <CardTitle>Return Reasons</CardTitle>
            <CardDescription>Why customers are returning products</CardDescription>
          </CardHeader>
          <CardContent>
            {reasons.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={reasons.slice(0, 8)}
                      dataKey="count"
                      nameKey="return_reason"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${entry.return_reason.substring(0, 15)}...`}
                    >
                      {reasons.slice(0, 8).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => formatNumber(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                <div className="mt-4 space-y-2">
                  {reasons.slice(0, 8).map((reason: any, index: number) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-3 w-3 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-xs">{reason.return_reason}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium">{formatNumber(reason.count)}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({formatCurrency(reason.total_refunds)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No return reason data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category Analysis */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Category Distribution</CardTitle>
            <CardDescription>Revenue by product category</CardDescription>
          </CardHeader>
          <CardContent>
            {categories.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="total_refunds"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry) => entry.category}
                    >
                      {categories.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="mt-4 space-y-2">
                  {categories.map((cat: any, index: number) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-xs">{cat.category}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium">{formatCurrency(cat.total_refunds)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No category data available</p>
            )}
          </CardContent>
        </Card>

        {/* Category Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Category Performance</CardTitle>
            <CardDescription>Top categories by revenue</CardDescription>
          </CardHeader>
          <CardContent>
            {categories.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={categories}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="category"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === 'Total Refunds') return formatCurrency(value)
                      return formatNumber(value)
                    }}
                  />
                  <Legend />
                  <Bar dataKey="total_refunds" fill="#FF6B6B" name="Total Refunds" />
                  <Bar dataKey="return_count" fill="#4ECDC4" name="Return Count" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No category data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Returned Products</CardTitle>
          <CardDescription>Complete list of products with returns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Product</th>
                  <th className="text-left py-2 px-4">ASIN</th>
                  <th className="text-right py-2 px-4">Returns</th>
                  <th className="text-right py-2 px-4">Units</th>
                  <th className="text-right py-2 px-4">Total Refunds</th>
                  <th className="text-right py-2 px-4">Avg Refund</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product: any) => (
                  <tr key={product.asin} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4 max-w-xs truncate">{product.product_name}</td>
                    <td className="py-2 px-4 text-xs text-muted-foreground">{product.asin}</td>
                    <td className="py-2 px-4 text-right">{formatNumber(product.return_count)}</td>
                    <td className="py-2 px-4 text-right">{formatNumber(product.units_returned)}</td>
                    <td className="py-2 px-4 text-right text-red-600 font-medium">
                      {formatCurrency(product.total_refunds)}
                    </td>
                    <td className="py-2 px-4 text-right">{formatCurrency(product.avg_refund)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

