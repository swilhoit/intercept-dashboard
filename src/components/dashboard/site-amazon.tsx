"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Package, DollarSign, TrendingUp, ShoppingCart, Users, Target } from "lucide-react"
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
  const adsData = salesData?.ads || []

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
      title: "Conversion Rate",
      value: `${(trafficData?.conversion_rate || 0).toFixed(2)}%`,
      icon: <Target className="h-4 w-4" />,
      description: "Visit to purchase"
    }
  ]

  const COLORS = ['#FF9500', '#FF6B00', '#FF8C00', '#FFB300', '#FFC700']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Amazon Store</h2>
          <p className="text-muted-foreground">
            Sales and marketing performance for Amazon marketplace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[#FF9500]" />
          <span className="text-sm font-medium">Amazon</span>
        </div>
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

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList className="grid w-full max-w-[800px] grid-cols-5">
          <TabsTrigger value="sales">Sales Trend</TabsTrigger>
          <TabsTrigger value="products">Top Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="advertising">Ads Performance</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Products</CardTitle>
              <CardDescription>Best selling products on Amazon</CardDescription>
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
                    <Bar dataKey="revenue" fill="#FF9500" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="advertising" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Campaigns</CardTitle>
                <CardDescription>Best campaigns by cost and performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {adsData.slice(0, 5).map((campaign: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-sm truncate">{campaign.campaign_name}</p>
                        <p className="text-xs text-muted-foreground">
                          CTR: {campaign.ctr}% | CPC: ${campaign.cpc}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">${campaign.total_cost}</p>
                        <p className="text-xs text-muted-foreground">{campaign.total_clicks} clicks</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Advertising Metrics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Total Ad Spend</span>
                      <span className="text-sm font-medium">
                        ${formatNumber(adsData.reduce((sum: number, ad: any) => sum + (ad.total_cost || 0), 0))}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#FF9500] h-2 rounded-full" style={{ width: '85%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Total Clicks</span>
                      <span className="text-sm font-medium">
                        {formatNumber(adsData.reduce((sum: number, ad: any) => sum + (ad.total_clicks || 0), 0))}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#FF9500] h-2 rounded-full" style={{ width: '70%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Avg CTR</span>
                      <span className="text-sm font-medium">
                        {adsData.length > 0 
                          ? (adsData.reduce((sum: number, ad: any) => sum + (ad.ctr || 0), 0) / adsData.length).toFixed(2) 
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#FF9500] h-2 rounded-full" style={{ width: '65%' }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Keywords Performance</CardTitle>
              <CardDescription>Top performing keywords and search terms</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Keyword</th>
                      <th className="text-left p-2">Search Term</th>
                      <th className="text-left p-2">Match Type</th>
                      <th className="text-right p-2">Clicks</th>
                      <th className="text-right p-2">Cost</th>
                      <th className="text-right p-2">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adsData.filter((ad: any) => ad.keyword_text).slice(0, 10).map((ad: any, index: number) => (
                      <tr key={index} className="border-b">
                        <td className="p-2 font-medium truncate max-w-[200px]">{ad.keyword_text}</td>
                        <td className="p-2 text-muted-foreground truncate max-w-[200px]">{ad.search_term || '-'}</td>
                        <td className="p-2">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                            {ad.match_type}
                          </span>
                        </td>
                        <td className="p-2 text-right">{ad.total_clicks}</td>
                        <td className="p-2 text-right">${ad.total_cost}</td>
                        <td className="p-2 text-right">{ad.ctr}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Traffic Sources</CardTitle>
                <CardDescription>How customers find your Amazon store</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[#FF9500]" />
                      <span className="text-sm">Amazon Search</span>
                    </div>
                    <span className="text-sm font-medium">45%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[#FF6B00]" />
                      <span className="text-sm">Direct Traffic</span>
                    </div>
                    <span className="text-sm font-medium">25%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[#FF8C00]" />
                      <span className="text-sm">Sponsored Products</span>
                    </div>
                    <span className="text-sm font-medium">20%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[#FFB300]" />
                      <span className="text-sm">External</span>
                    </div>
                    <span className="text-sm font-medium">10%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Marketing Metrics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Page Views</span>
                      <span className="text-sm font-medium">{formatNumber(trafficData?.page_views || 0)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#FF9500] h-2 rounded-full" style={{ width: '75%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Sessions</span>
                      <span className="text-sm font-medium">{formatNumber(trafficData?.sessions || 0)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#FF9500] h-2 rounded-full" style={{ width: '60%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Buy Box %</span>
                      <span className="text-sm font-medium">92%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#FF9500] h-2 rounded-full" style={{ width: '92%' }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}