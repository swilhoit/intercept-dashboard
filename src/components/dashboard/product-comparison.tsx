"use client"

import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ArrowUpIcon, ArrowDownIcon, TrendingUp, Package } from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/utils"

interface ProductComparisonProps {
  data: any[]
  dateRange?: { from: Date | undefined; to?: Date | undefined }
}

export function ProductComparison({ data, dateRange }: ProductComparisonProps) {
  const formatCurrencyLocal = (value: number) => {
    return formatCurrency(value, 0)
  }

  // Process data for top products comparison
  const topProducts = data
    .reduce((acc: any[], item: any) => {
      const existing = acc.find(p => p.product_name === item.product_name)
      if (existing) {
        existing.amazon_sales += item.channel === 'Amazon' ? (item.total_sales || 0) : 0
        existing.woocommerce_sales += item.channel === 'WooCommerce' ? (item.total_sales || 0) : 0
        existing.total_sales = existing.amazon_sales + existing.woocommerce_sales
        existing.amazon_quantity += item.channel === 'Amazon' ? (item.quantity || 0) : 0
        existing.woocommerce_quantity += item.channel === 'WooCommerce' ? (item.quantity || 0) : 0
        existing.total_quantity = existing.amazon_quantity + existing.woocommerce_quantity
      } else {
        acc.push({
          product_name: item.product_name,
          amazon_sales: item.channel === 'Amazon' ? (item.total_sales || 0) : 0,
          woocommerce_sales: item.channel === 'WooCommerce' ? (item.total_sales || 0) : 0,
          total_sales: item.total_sales || 0,
          amazon_quantity: item.channel === 'Amazon' ? (item.quantity || 0) : 0,
          woocommerce_quantity: item.channel === 'WooCommerce' ? (item.quantity || 0) : 0,
          total_quantity: item.quantity || 0
        })
      }
      return acc
    }, [])
    .sort((a: any, b: any) => b.total_sales - a.total_sales)
    .slice(0, 10)
    .map((item: any) => ({
      ...item,
      name: item.product_name.length > 30 
        ? item.product_name.substring(0, 27) + '...' 
        : item.product_name
    }))

  // Calculate channel performance metrics
  const channelMetrics = data.reduce((acc: any, item: any) => {
    if (!acc[item.channel]) {
      acc[item.channel] = {
        totalRevenue: 0,
        totalQuantity: 0,
        productCount: new Set(),
        avgOrderValue: 0,
        transactions: 0
      }
    }
    
    acc[item.channel].totalRevenue += item.total_sales || 0
    acc[item.channel].totalQuantity += item.quantity || 0
    acc[item.channel].productCount.add(item.product_id)
    acc[item.channel].transactions += 1
    
    return acc
  }, {})

  const channelComparison = Object.entries(channelMetrics).map(([channel, metrics]: [string, any]) => ({
    channel,
    revenue: metrics.totalRevenue,
    quantity: metrics.totalQuantity,
    products: metrics.productCount.size,
    avgOrderValue: metrics.totalRevenue / Math.max(metrics.transactions, 1)
  }))

  // Calculate overall comparison stats
  const comparisonStats = {
    amazonRevenue: channelMetrics['Amazon']?.totalRevenue || 0,
    woocommerceRevenue: channelMetrics['WooCommerce']?.totalRevenue || 0,
    amazonProducts: channelMetrics['Amazon']?.productCount.size || 0,
    woocommerceProducts: channelMetrics['WooCommerce']?.productCount.size || 0,
    totalRevenue: (channelMetrics['Amazon']?.totalRevenue || 0) + (channelMetrics['WooCommerce']?.totalRevenue || 0),
    amazonDominance: channelMetrics['Amazon']?.totalRevenue > channelMetrics['WooCommerce']?.totalRevenue
  }

  return (
    <div className="space-y-4">
      {/* Quick Comparison Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Amazon Revenue</CardTitle>
            <div className="h-4 w-4 rounded-full bg-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(comparisonStats.amazonRevenue, 0)}</div>
            <p className="text-xs text-muted-foreground">
              {comparisonStats.amazonProducts} {comparisonStats.amazonProducts === 1 ? 'product' : 'products'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WooCommerce Revenue</CardTitle>
            <div className="h-4 w-4 rounded-full bg-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(comparisonStats.woocommerceRevenue, 0)}</div>
            <p className="text-xs text-muted-foreground">
              {comparisonStats.woocommerceProducts} {comparisonStats.woocommerceProducts === 1 ? 'product' : 'products'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Split</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {comparisonStats.totalRevenue > 0 
                ? `${((comparisonStats.amazonRevenue / comparisonStats.totalRevenue) * 100).toFixed(0)}% / ${((comparisonStats.woocommerceRevenue / comparisonStats.totalRevenue) * 100).toFixed(0)}%`
                : '0% / 0%'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Amazon / WooCommerce
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leading Channel</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {comparisonStats.amazonDominance ? 'Amazon' : 'WooCommerce'}
            </div>
            <p className="text-xs text-muted-foreground">
              By revenue volume
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Performance Comparison</CardTitle>
          <CardDescription>
            Compare top products across Amazon and WooCommerce channels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="revenue" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="revenue">Revenue Comparison</TabsTrigger>
              <TabsTrigger value="quantity">Quantity Comparison</TabsTrigger>
              <TabsTrigger value="combined">Combined View</TabsTrigger>
            </TabsList>
            
            <TabsContent value="revenue" className="space-y-4">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topProducts} margin={{ left: 50, right: 20, bottom: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tickFormatter={formatCurrencyLocal} />
                  <Tooltip formatter={(value: any) => formatCurrencyLocal(value)} />
                  <Legend />
                  <Bar dataKey="amazon_sales" name="Amazon" fill="#FF9500" />
                  <Bar dataKey="woocommerce_sales" name="WooCommerce" fill="#007AFF" />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>
            
            <TabsContent value="quantity" className="space-y-4">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topProducts} margin={{ left: 50, right: 20, bottom: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="amazon_quantity" name="Amazon Units" fill="#FF9500" />
                  <Bar dataKey="woocommerce_quantity" name="WooCommerce Units" fill="#007AFF" />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>
            
            <TabsContent value="combined" className="space-y-4">
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={topProducts} margin={{ left: 50, right: 50, bottom: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis yAxisId="left" tickFormatter={formatCurrencyLocal} />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip 
                    formatter={(value: any, name: string) => {
                      if (name.includes('Quantity')) {
                        return value
                      }
                      return formatCurrencyLocal(value)
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="total_sales" name="Total Revenue" fill="#8884d8" />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="total_quantity" 
                    name="Total Quantity" 
                    stroke="#82ca9d" 
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Channel Product Distribution</CardTitle>
            <CardDescription>Unique products and performance by channel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {channelComparison.map((channel) => (
                <div key={channel.channel} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge 
                        className={channel.channel === 'Amazon' ? 'bg-orange-500' : 'bg-blue-500'} 
                        variant="secondary"
                      >
                        {channel.channel}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {channel.products} {channel.products === 1 ? 'product' : 'products'}
                      </span>
                    </div>
                    <span className="font-semibold">{formatCurrencyLocal(channel.revenue)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Units Sold:</span>
                      <span className="ml-2 font-medium">{channel.quantity.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Order:</span>
                      <span className="ml-2 font-medium">{formatCurrencyLocal(channel.avgOrderValue)}</span>
                    </div>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${channel.channel === 'Amazon' ? 'bg-orange-500' : 'bg-blue-500'}`}
                      style={{ width: `${(channel.revenue / Math.max(...channelComparison.map(c => c.revenue))) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performers Summary</CardTitle>
            <CardDescription>Best selling products across all channels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topProducts.slice(0, 5).map((product, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold text-muted-foreground">
                      #{index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-sm truncate max-w-[200px]">
                        {product.product_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {product.total_quantity} units sold
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrencyLocal(product.total_sales)}</div>
                    <div className="flex gap-1">
                      {product.amazon_sales > 0 && (
                        <Badge className="bg-orange-500 text-white text-xs" variant="secondary">A</Badge>
                      )}
                      {product.woocommerce_sales > 0 && (
                        <Badge className="bg-blue-500 text-white text-xs" variant="secondary">W</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}