"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { safeNumber, validateChartData } from "@/lib/data-validation"
import { ErrorBoundary } from "@/components/error-boundary"
import { AlertCircle } from "lucide-react"

interface ChannelBreakdownProps {
  amazonRevenue?: number
  woocommerceRevenue?: number
  loading?: boolean
}

export function ChannelBreakdown({
  amazonRevenue,
  woocommerceRevenue,
  loading = false
}: ChannelBreakdownProps) {
  // Validate and sanitize input data
  const safeAmazonRevenue = safeNumber(amazonRevenue)
  const safeWoocommerceRevenue = safeNumber(woocommerceRevenue)
  const total = safeAmazonRevenue + safeWoocommerceRevenue

  // Build chart data
  const data = [
    {
      name: "Amazon",
      value: safeAmazonRevenue,
      color: "#FF9500"
    },
    {
      name: "WooCommerce",
      value: safeWoocommerceRevenue,
      color: "#007AFF"
    }
  ]

  // Validate chart data
  const validation = validateChartData(data)
  const hasValidData = validation.isValid && total > 0

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null

    const data = payload[0]
    const value = safeNumber(data.value)
    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'

    return (
      <div className="bg-background border border-border p-2 rounded-md shadow-sm">
        <p className="font-medium">{data.name || 'Unknown'}</p>
        <p className="text-sm text-muted-foreground">
          {formatCurrency(value)} ({percentage}%)
        </p>
      </div>
    )
  }

  return (
    <ErrorBoundary componentName="ChannelBreakdown">
      <Card>
        <CardHeader>
          <CardTitle>Channel Revenue Distribution</CardTitle>
          <CardDescription>Revenue breakdown by sales channel</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Loading revenue data...
            </div>
          ) : !hasValidData ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>No revenue data available</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={validation.data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => {
                      if (!name) return ''
                      const safeValue = safeNumber(value)
                      const percentage = total > 0 ? ((safeValue / total) * 100).toFixed(1) : '0'
                      return `${name}: ${percentage}%`
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {validation.data.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 space-y-2">
                {data.map((channel) => (
                  <div key={channel.name} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: channel.color }}
                      />
                      <span className="text-sm font-medium">{channel.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(channel.value)}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between font-medium">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </ErrorBoundary>
  )
}