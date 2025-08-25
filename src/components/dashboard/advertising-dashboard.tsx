"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from "recharts"
import { DateRange } from "react-day-picker"
import { TrendingUp, TrendingDown, DollarSign, MousePointer, Eye, ShoppingCart, Target } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AdvertisingDashboardProps {
  dateRange?: DateRange
}

export function AdvertisingDashboard({ dateRange }: AdvertisingDashboardProps) {
  const [data, setData] = useState<any>({
    campaigns: [],
    trend: [],
    channels: [],
    categoryBreakdown: [],
    summary: {}
  })
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'spend' | 'clicks' | 'conversions'>('spend')
  const [sortBy, setSortBy] = useState<string>('spend')

  useEffect(() => {
    fetchData()
  }, [dateRange])

  const fetchData = async () => {
    setLoading(true)
    
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }

    try {
      const response = await fetch(`/api/ads/campaigns?${params}`)
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error("Error fetching advertising data:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number, decimals: number = 0) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value))
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    // Handle different date formats
    let date: Date
    if (dateStr.includes('T')) {
      // ISO format
      date = new Date(dateStr)
    } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // YYYY-MM-DD format
      date = new Date(dateStr + 'T00:00:00')
    } else {
      // Fallback
      date = new Date(dateStr)
    }
    
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', dateStr)
      return dateStr // Return original string if parsing fails
    }
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'Paint': '#4ECDC4',
      'Fireplace Doors': '#FF6B6B',
      'Mantels': '#95E1D3',
      'Other': '#95A5A6'
    }
    return colors[category] || '#95A5A6'
  }

  const getChannelColor = (channel: string) => {
    const colors: { [key: string]: string } = {
      'SEARCH': '#4285F4',
      'SHOPPING': '#34A853',
      'DISPLAY': '#FBBC04',
      'VIDEO': '#EA4335',
      'PERFORMANCE_MAX': '#9333EA',
      'Unknown': '#95A5A6'
    }
    return colors[channel] || '#95A5A6'
  }

  // Sort campaigns based on selected criteria
  const sortedCampaigns = [...(data.campaigns || [])].sort((a, b) => {
    switch(sortBy) {
      case 'spend': return b.spend - a.spend
      case 'clicks': return b.clicks - a.clicks
      case 'conversions': return b.conversions - a.conversions
      case 'ctr': return b.ctr - a.ctr
      case 'roas': return b.roas - a.roas
      default: return b.spend - a.spend
    }
  })

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">Loading advertising data...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary?.totalSpend || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary?.activeCampaigns || 0} active campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impressions</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.totalImpressions || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Total ad views
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clicks</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.totalClicks || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Total interactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.totalConversions || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Total conversions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg CPC</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.summary?.totalClicks > 0 ? data.summary.totalSpend / data.summary.totalClicks : 0, 2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Cost per click
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CTR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPercent(data.summary?.totalImpressions > 0 ? (data.summary.totalClicks * 100.0) / data.summary.totalImpressions : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Click-through rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Channel and Category Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Channel Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Channel Performance</CardTitle>
            <CardDescription>Ad spend and performance by channel type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.channels || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={formatCurrency} />
                <Tooltip 
                  formatter={(value: any, name: string) => {
                    if (name === 'spend') return formatCurrency(value)
                    if (name === 'ctr') return formatPercent(value)
                    return formatNumber(value)
                  }}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Bar dataKey="spend" fill="#4285F4" name="Spend" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {data.channels?.map((channel: any) => (
                <div key={channel.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getChannelColor(channel.name) }}
                    />
                    <span>{channel.name}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{formatCurrency(channel.spend)}</span>
                    <span>CTR: {formatPercent(channel.ctr)}</span>
                    <span>CPC: {formatCurrency(channel.cpc, 2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Category Performance</CardTitle>
            <CardDescription>Ad spend and metrics by product category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.categoryBreakdown || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${((entry.spend / data.summary?.totalSpend) * 100).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="spend"
                >
                  {(data.categoryBreakdown || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => formatCurrency(value)}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {data.categoryBreakdown?.map((cat: any) => (
                <div key={cat.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getCategoryColor(cat.name) }}
                    />
                    <span>{cat.name}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{formatCurrency(cat.spend)}</span>
                    <span>{cat.campaignCount} campaigns</span>
                    <span>ROAS: {(cat.roas || 0).toFixed(2)}x</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Performance Trend</CardTitle>
              <CardDescription>Daily advertising metrics by category</CardDescription>
            </div>
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'spend' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('spend')}
              >
                Spend
              </Button>
              <Button
                variant={viewMode === 'clicks' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('clicks')}
              >
                Clicks
              </Button>
              <Button
                variant={viewMode === 'conversions' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('conversions')}
              >
                Conversions
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={data.trend?.map((item: any) => {
              const dataPoint: any = { date: formatDate(item.date) }
              Object.keys(item).forEach(key => {
                if (key !== 'date' && item[key]) {
                  dataPoint[key] = item[key][viewMode] || 0
                }
              })
              return dataPoint
            })}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                angle={data.trend?.length > 20 ? -45 : 0}
                textAnchor={data.trend?.length > 20 ? "end" : "middle"}
                height={data.trend?.length > 20 ? 80 : 40}
              />
              <YAxis 
                className="text-xs"
                tickFormatter={viewMode === 'spend' ? formatCurrency : formatNumber}
              />
              <Tooltip 
                formatter={(value: any) => 
                  viewMode === 'spend' ? formatCurrency(value) : formatNumber(value)
                }
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              {['Paint', 'Fireplace Doors', 'Mantels', 'Other'].map(category => (
                <Line 
                  key={category}
                  type="monotone" 
                  dataKey={category}
                  stroke={getCategoryColor(category)}
                  strokeWidth={2}
                  dot={data.trend?.length <= 30}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Campaign Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Campaign Performance</CardTitle>
              <CardDescription>Detailed metrics for all campaigns</CardDescription>
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spend">Sort by Spend</SelectItem>
                <SelectItem value="clicks">Sort by Clicks</SelectItem>
                <SelectItem value="conversions">Sort by Conversions</SelectItem>
                <SelectItem value="ctr">Sort by CTR</SelectItem>
                <SelectItem value="roas">Sort by ROAS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCampaigns.slice(0, 15).map((campaign: any, index: number) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate max-w-[200px]">{campaign.name}</span>
                      {campaign.status === 'ENABLED' && (
                        <Badge variant="outline" className="text-green-600">Active</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      style={{ 
                        borderColor: getCategoryColor(campaign.category),
                        color: getCategoryColor(campaign.category)
                      }}
                    >
                      {campaign.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      style={{ 
                        backgroundColor: getChannelColor(campaign.channelType),
                        color: 'white'
                      }}
                    >
                      {campaign.channelType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(campaign.spend)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(campaign.clicks)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(campaign.ctr)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(campaign.cpc, 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(campaign.conversions)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={campaign.roas >= 1 ? 'text-green-600' : 'text-red-600'}>
                      {(campaign.roas || 0).toFixed(2)}x
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}