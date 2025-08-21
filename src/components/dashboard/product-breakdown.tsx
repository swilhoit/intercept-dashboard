"use client"

import React, { useState, useMemo } from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Package } from "lucide-react"
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ProductBreakdownProps {
  data: {
    breakdown: Array<{
      period: string
      product_name: string
      product_id: string
      sku: string
      channel: string
      total_sales: number
      quantity: number
      avg_price: number
      transaction_count: number
    }>
    summary: Array<{
      product_name: string
      product_id: string
      sku: string
      channel: string
      total_revenue: number
      total_quantity: number
      periods: Array<{
        period: string
        sales: number
        quantity: number
        avg_price: number
      }>
      avg_price: number
      transaction_count: number
    }>
    totalProducts: number
  }
  loading?: boolean
}

export function ProductBreakdown({ data, loading = false }: ProductBreakdownProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity' | 'transactions'>('revenue')
  const [showTopN, setShowTopN] = useState<number>(10)
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0)
  }
  
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value || 0)
  }
  
  const getChannelColor = (channel: string) => {
    return channel === 'Amazon' ? 'bg-orange-500' : 'bg-blue-500'
  }
  
  const toggleRow = (productId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId)
    } else {
      newExpanded.add(productId)
    }
    setExpandedRows(newExpanded)
  }
  
  const sortedProducts = useMemo(() => {
    if (!data?.summary) return []
    
    const sorted = [...data.summary].sort((a, b) => {
      switch (sortBy) {
        case 'revenue':
          return b.total_revenue - a.total_revenue
        case 'quantity':
          return b.total_quantity - a.total_quantity
        case 'transactions':
          return b.transaction_count - a.transaction_count
        default:
          return b.total_revenue - a.total_revenue
      }
    })
    
    return sorted.slice(0, showTopN)
  }, [data?.summary, sortBy, showTopN])
  
  const calculateTrend = (periods: any[]) => {
    if (!periods || periods.length < 2) return 0
    const recent = periods.slice(0, Math.min(3, periods.length))
    const older = periods.slice(Math.min(3, periods.length), Math.min(6, periods.length))
    
    if (older.length === 0) return 0
    
    const recentAvg = recent.reduce((sum, p) => sum + p.sales, 0) / recent.length
    const olderAvg = older.reduce((sum, p) => sum + p.sales, 0) / older.length
    
    if (olderAvg === 0) return 0
    return ((recentAvg - olderAvg) / olderAvg) * 100
  }
  
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Performance Breakdown</CardTitle>
          <CardDescription>Loading product data...</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Product Performance Breakdown</CardTitle>
              <CardDescription>
                Detailed analysis of {data?.totalProducts || 0} unique products across channels
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="quantity">Quantity</SelectItem>
                  <SelectItem value="transactions">Transactions</SelectItem>
                </SelectContent>
              </Select>
              <Select value={showTopN.toString()} onValueChange={(v) => setShowTopN(Number(v))}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="25">Top 25</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>ID/SKU</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Units Sold</TableHead>
                <TableHead className="text-right">Avg Price</TableHead>
                <TableHead className="text-right">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProducts.map((product) => {
                const rowKey = `${product.product_id}_${product.channel}`
                const isExpanded = expandedRows.has(rowKey)
                const trend = calculateTrend(product.periods)
                
                return (
                  <React.Fragment key={rowKey}>
                    <TableRow 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleRow(rowKey)}
                    >
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium max-w-[250px]">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{product.product_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getChannelColor(product.channel)} text-white`} variant="secondary">
                          {product.channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>
                          <div>ID: {product.product_id}</div>
                          {product.sku && <div>SKU: {product.sku}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(product.total_revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(product.total_quantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(product.total_revenue / Math.max(product.total_quantity, 1))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`flex items-center justify-end gap-1 ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {trend > 0 ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : trend < 0 ? (
                            <TrendingDown className="h-4 w-4" />
                          ) : null}
                          <span className="font-medium">
                            {trend !== 0 ? `${trend > 0 ? '+' : ''}${trend.toFixed(1)}%` : '-'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0">
                          <div className="bg-muted/20 p-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-sm font-medium mb-2">Sales Trend</h4>
                                <ResponsiveContainer width="100%" height={150}>
                                  <LineChart data={product.periods.slice(0, 10).reverse()}>
                                    <XAxis 
                                      dataKey="period" 
                                      tick={{ fontSize: 10 }}
                                      angle={-45}
                                      textAnchor="end"
                                      height={60}
                                    />
                                    <YAxis 
                                      tick={{ fontSize: 10 }}
                                      tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                                    />
                                    <Tooltip 
                                      formatter={(value: any) => formatCurrency(value)}
                                      labelStyle={{ color: '#000' }}
                                    />
                                    <Line 
                                      type="monotone" 
                                      dataKey="sales" 
                                      stroke={product.channel === 'Amazon' ? '#FF9500' : '#007AFF'}
                                      strokeWidth={2}
                                      dot={{ r: 3 }}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium mb-2">Period Details</h4>
                                <div className="max-h-[150px] overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left p-1">Period</th>
                                        <th className="text-right p-1">Sales</th>
                                        <th className="text-right p-1">Qty</th>
                                        <th className="text-right p-1">Avg</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {product.periods.slice(0, 5).map((period, idx) => (
                                        <tr key={idx} className="border-b">
                                          <td className="p-1">{period.period}</td>
                                          <td className="text-right p-1">{formatCurrency(period.sales)}</td>
                                          <td className="text-right p-1">{period.quantity}</td>
                                          <td className="text-right p-1">{formatCurrency(period.avg_price || 0)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="pt-2 text-xs text-muted-foreground">
                                  Total Transactions: {product.transaction_count}
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}