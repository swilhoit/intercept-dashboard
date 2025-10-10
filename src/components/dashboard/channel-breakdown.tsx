"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface ChannelBreakdownProps {
  amazonRevenue: number
  woocommerceRevenue: number
}

export function ChannelBreakdown({ amazonRevenue, woocommerceRevenue }: ChannelBreakdownProps) {
  // Debug logging to see what props we're receiving
  console.log('📊 ChannelBreakdown Props:', {
    amazonRevenue,
    woocommerceRevenue,
    amazonType: typeof amazonRevenue,
    woocommerceType: typeof woocommerceRevenue
  })


  const data = [
    {
      name: "Amazon",
      value: amazonRevenue || 0,
      color: "#FF9500"
    },
    {
      name: "WooCommerce",
      value: woocommerceRevenue || 0,
      color: "#007AFF"
    }
  ]

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      const total = amazonRevenue + woocommerceRevenue
      const percentage = ((data.value / total) * 100).toFixed(1)
      
      return (
        <div className="bg-background border border-border p-2 rounded-md shadow-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(data.value)} ({percentage}%)
          </p>
        </div>
      )
    }
    return null
  }

  const total = amazonRevenue + woocommerceRevenue

  return (
    <Card>
      <CardHeader>
        <CardTitle>Channel Revenue Distribution</CardTitle>
        <CardDescription>Revenue breakdown by sales channel</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value }) => {
                const percentage = (((value || 0) / total) * 100).toFixed(1)
                return `${name}: ${percentage}%`
              }}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
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
      </CardContent>
    </Card>
  )
}