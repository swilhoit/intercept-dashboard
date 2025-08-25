"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from "recharts"
import { DateRange } from "react-day-picker"
import { Users, Eye, MousePointer, Clock, Globe, Monitor, Smartphone, Tablet, TrendingUp, ArrowUp, ArrowDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TrafficAnalyticsProps {
  dateRange?: DateRange
}

export function TrafficAnalytics({ dateRange }: TrafficAnalyticsProps) {
  const [data, setData] = useState<any>({
    summary: {},
    sites: [],
    channels: [],
    devices: [],
    topPages: [],
    sources: [],
    trend: [],
    geography: []
  })
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'users' | 'sessions' | 'pageviews'>('sessions')
  const [selectedSite, setSelectedSite] = useState<string>('all')

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
      const response = await fetch(`/api/analytics/traffic?${params}`)
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error("Error fetching traffic analytics:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value))
  }

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getChannelColor = (channel: string) => {
    const colors: { [key: string]: string } = {
      'Organic Search': '#10B981',
      'Direct': '#3B82F6',
      'Paid Search': '#F59E0B',
      'Referral': '#8B5CF6',
      'Social': '#EC4899',
      'Email': '#14B8A6',
      'Display': '#F97316',
      'Affiliates': '#84CC16',
      'Other': '#6B7280'
    }
    return colors[channel] || '#6B7280'
  }

  const getDeviceIcon = (device: string) => {
    switch(device.toLowerCase()) {
      case 'desktop': return <Monitor className="h-4 w-4" />
      case 'mobile': return <Smartphone className="h-4 w-4" />
      case 'tablet': return <Tablet className="h-4 w-4" />
      default: return <Monitor className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">Loading traffic analytics...</div>
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
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.total_users || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(data.summary?.new_users || 0)} new users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.total_sessions || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Total website sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Page Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.page_views || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Total pages viewed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Session</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.summary?.page_views && data.summary?.total_sessions 
                ? (data.summary.page_views / data.summary.total_sessions).toFixed(1)
                : '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Pages per session
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.total_conversions || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Goal completions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conv. Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.summary?.total_conversions && data.summary?.total_sessions 
                ? formatPercent(data.summary.total_conversions / data.summary.total_sessions)
                : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              Session conversion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Site Comparison */}
      {data.sites && data.sites.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Site Performance Comparison</CardTitle>
            <CardDescription>Metrics across different properties</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.sites.map((site: any) => (
                <div key={site.name} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-semibold">{site.site_name}</h4>
                    <div className="flex gap-6 mt-2 text-sm text-muted-foreground">
                      <span>Users: {formatNumber(site.total_users || 0)}</span>
                      <span>Sessions: {formatNumber(site.total_sessions || 0)}</span>
                      <span>Page Views: {formatNumber(site.page_views || 0)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Bounce Rate</div>
                    <div className="text-lg font-semibold">
                      {formatPercent(site.avg_bounce_rate || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channels and Devices */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Channel Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Traffic Channels</CardTitle>
            <CardDescription>Session distribution by acquisition channel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.channels || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${((entry.sessions / data.summary?.total_sessions) * 100).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="sessions"
                >
                  {(data.channels || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={getChannelColor(entry.channel)} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => formatNumber(value)}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {data.channels?.slice(0, 5).map((channel: any) => (
                <div key={channel.channel} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getChannelColor(channel.channel) }}
                    />
                    <span>{channel.channel}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{formatNumber(channel.sessions)} sessions</span>
                    <span>Bounce: {formatPercent(channel.bounce_rate || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Device Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Device Categories</CardTitle>
            <CardDescription>User distribution by device type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.devices || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="device" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={formatNumber} />
                <Tooltip 
                  formatter={(value: any, name: string) => {
                    if (name === 'bounce_rate') return formatPercent(value)
                    return formatNumber(value)
                  }}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Bar dataKey="sessions" fill="#3B82F6" name="Sessions" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {data.devices?.map((device: any) => (
                <div key={device.device} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {getDeviceIcon(device.device)}
                    <span className="capitalize">{device.device}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{formatNumber(device.users)} users</span>
                    <span>{formatNumber(device.page_views)} views</span>
                    <span>Bounce: {formatPercent(device.bounce_rate || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Traffic Trend</CardTitle>
              <CardDescription>Daily website traffic metrics</CardDescription>
            </div>
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'users' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('users')}
              >
                Users
              </Button>
              <Button
                variant={viewMode === 'sessions' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('sessions')}
              >
                Sessions
              </Button>
              <Button
                variant={viewMode === 'pageviews' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('pageviews')}
              >
                Page Views
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={data.trend?.map((item: any) => ({
              ...item,
              date: formatDate(item.date),
              value: viewMode === 'users' ? item.users : 
                     viewMode === 'sessions' ? item.sessions : 
                     item.page_views
            }))}>
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
                tickFormatter={formatNumber}
              />
              <Tooltip 
                formatter={(value: any) => formatNumber(value)}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value"
                name={viewMode === 'users' ? 'Users' : viewMode === 'sessions' ? 'Sessions' : 'Page Views'}
                stroke="#3B82F6"
                strokeWidth={2}
                dot={data.trend?.length <= 30}
              />
              {viewMode === 'sessions' && (
                <Line 
                  type="monotone" 
                  dataKey="conversions"
                  name="Conversions"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 5"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tables Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Pages */}
        <Card>
          <CardHeader>
            <CardTitle>Top Pages</CardTitle>
            <CardDescription>Most visited pages on the site</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Bounce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topPages?.slice(0, 10).map((page: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <div className="truncate font-medium text-sm">{page.page}</div>
                        {page.title && (
                          <div className="truncate text-xs text-muted-foreground">{page.title}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(page.views)}</TableCell>
                    <TableCell className="text-right">{formatNumber(page.users)}</TableCell>
                    <TableCell className="text-right">{formatPercent(page.bounce_rate || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Traffic Sources */}
        <Card>
          <CardHeader>
            <CardTitle>Traffic Sources</CardTitle>
            <CardDescription>Where your visitors come from</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source / Medium</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sources?.slice(0, 10).map((source: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <div className="truncate font-medium text-sm">{source.source}</div>
                        <div className="truncate text-xs text-muted-foreground">{source.medium || 'direct'}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(source.users)}</TableCell>
                    <TableCell className="text-right">{formatNumber(source.sessions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(source.conversions || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Geographic Distribution */}
      {data.geography && data.geography.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Geographic Distribution</CardTitle>
            <CardDescription>Top countries by sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.geography.slice(0, 10).map((country: any) => {
                const percentage = (country.sessions / data.summary?.total_sessions) * 100
                return (
                  <div key={country.country} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{country.country}</span>
                    </div>
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1 bg-secondary rounded-full h-2">
                        <div 
                          className="bg-primary rounded-full h-2 transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground w-20 text-right">
                        {formatNumber(country.sessions)} ({percentage.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}