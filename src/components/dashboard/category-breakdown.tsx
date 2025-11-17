"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { safeNumber, validateChartData } from "@/lib/data-validation"
import { ErrorBoundary } from "@/components/error-boundary"
import { AlertCircle } from "lucide-react"

interface CategoryBreakdownProps {
  categories?: {
    [key: string]: {
      totalSales: number
      totalQuantity: number
    }
  }
  loading?: boolean
}

const CATEGORY_COLORS: { [key: string]: string } = {
  "Greywater": "#5AC8FA",
  "Fireplace Doors": "#FF9500",
  "Paint": "#007AFF",
  "Other": "#34C759"
}

export function CategoryBreakdown({
  categories,
  loading = false
}: CategoryBreakdownProps) {
  // Build chart data from categories
  const data = categories ? Object.entries(categories).map(([name, data]) => ({
    name,
    value: safeNumber(data.totalSales),
    color: CATEGORY_COLORS[name] || "#8E8E93"
  })) : []

  const total = data.reduce((sum, item) => sum + item.value, 0)

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
      <div className="bg-background border border-border p-2 rounded-md">
        <p className="font-medium">{data.name || 'Unknown'}</p>
        <p className="text-sm text-muted-foreground">
          {formatCurrency(value)} ({percentage}%)
        </p>
      </div>
    )
  }

  return (
    <ErrorBoundary componentName="CategoryBreakdown">
      <Card>
        <CardHeader>
          <CardTitle>Category Revenue Distribution</CardTitle>
          <CardDescription>Revenue breakdown by product category</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Loading category data...
            </div>
          ) : !hasValidData ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>No category data available</p>
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
                {data.map((category) => (
                  <div key={category.name} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="text-sm font-medium">{category.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(category.value)}
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
