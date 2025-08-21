"use client"

import { useState, useEffect } from "react"
import { Line, LineChart, Bar, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRange } from "react-day-picker"

interface SalesChartWithToggleProps {
  dateRange?: DateRange
  channel?: string
  title?: string
  description?: string
}

export function SalesChartWithToggle({ 
  dateRange, 
  channel = "all",
  title = "Sales Over Time", 
  description = "Sales performance across all channels" 
}: SalesChartWithToggleProps) {
  const [aggregation, setAggregation] = useState<string>("daily")
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [dateRange, channel, aggregation])

  const fetchData = async () => {
    setLoading(true)
    
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }
    if (channel !== "all") {
      params.append("channel", channel)
    }
    params.append("aggregation", aggregation)

    try {
      const response = await fetch(`/api/sales/aggregated?${params}`)
      const salesData = await response.json()
      setData(salesData)
    } catch (error) {
      console.error("Error fetching chart data:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    // Handle period format for weekly/monthly aggregations
    if (dateStr && dateStr.includes('W')) {
      // Weekly format like "2025-W30"
      const [year, week] = dateStr.split('-W')
      return `Week ${week}`
    } else if (dateStr && dateStr.match(/^\d{4}-\d{2}$/)) {
      // Monthly format like "2025-07"
      const [year, month] = dateStr.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1)
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }
    // Daily format
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const chartData = data.map(item => ({
    ...item,
    date: item.period || formatDate(item.date),
    Amazon: item.amazon_sales,
    WooCommerce: item.woocommerce_sales,
    Total: item.total_sales,
  }))

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Select value={aggregation} onValueChange={setAggregation}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        {loading ? (
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            Loading chart data...
          </div>
        ) : (
          <Tabs defaultValue="combined" className="space-y-4">
            <TabsList>
              <TabsTrigger value="combined">Combined</TabsTrigger>
              <TabsTrigger value="comparison">Channel Comparison</TabsTrigger>
            </TabsList>
            
            <TabsContent value="combined" className="space-y-4">
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    angle={aggregation === "daily" && chartData.length > 20 ? -45 : 0}
                    textAnchor={aggregation === "daily" && chartData.length > 20 ? "end" : "middle"}
                    height={aggregation === "daily" && chartData.length > 20 ? 80 : 40}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    tickFormatter={formatCurrency}
                  />
                  <Tooltip 
                    formatter={(value: any) => formatCurrency(value)}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="Total" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={aggregation !== "daily" || chartData.length <= 30}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>
            
            <TabsContent value="comparison" className="space-y-4">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date"
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    angle={aggregation === "daily" && chartData.length > 20 ? -45 : 0}
                    textAnchor={aggregation === "daily" && chartData.length > 20 ? "end" : "middle"}
                    height={aggregation === "daily" && chartData.length > 20 ? 80 : 40}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    tickFormatter={formatCurrency}
                  />
                  <Tooltip 
                    formatter={(value: any) => formatCurrency(value)}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Amazon" fill="#FF9500" stackId="a" />
                  <Bar dataKey="WooCommerce" fill="#007AFF" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}