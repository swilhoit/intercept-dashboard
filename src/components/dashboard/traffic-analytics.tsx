"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from "recharts"
import { DateRange } from "react-day-picker"
import { Users, Eye, MousePointer, Clock, Globe, Monitor, Smartphone, Tablet, TrendingUp, ArrowUp, ArrowDown, Building } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { safePercentage, formatPercentage } from "@/lib/utils"

interface TrafficAnalyticsProps {
  dateRange?: DateRange
}

export function TrafficAnalytics({ dateRange }: TrafficAnalyticsProps) {
  const [data, setData] = useState<any>({
    summary: {},
    sites: [],
    siteTrends: [],
    aggregatedTrend: [],
    channels: [],
    devices: [],
    topPages: [],
    sources: [],
    geography: [],
    availableSites: []
  })
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'users' | 'sessions' | 'pageviews'>('sessions')
  const [selectedSite, setSelectedSite] = useState<string>('all')
  const [trendView, setTrendView] = useState<'aggregated' | 'per-site'>('aggregated')
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  useEffect(() => {
    fetchData()
  }, [dateRange, selectedSite, groupBy])

  const fetchData = async () => {
    setLoading(true)
    
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }
    if (selectedSite !== 'all') {
      params.append("site", selectedSite)
    }
    params.append("groupBy", groupBy)

    try {
      const response = await fetch(`/api/analytics/traffic?${params}`)
      const result = await response.json()
      console.log('Traffic Analytics API response:', result)
      setData(result || {
        summary: {},
        sites: [],
        siteTrends: [],
        aggregatedTrend: [],
        channels: [],
        devices: [],
        topPages: [],
        sources: [],
        geography: [],
        availableSites: []
      })
    } catch (error) {
      console.error("Error fetching traffic analytics:", error)
      setData({
        summary: {},
        sites: [],
        siteTrends: [],
        aggregatedTrend: [],
        channels: [],
        devices: [],
        topPages: [],
        sources: [],
        geography: [],
        availableSites: []
      })
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

  const formatDate = (dateStr: any) => {
    if (!dateStr) return ''
    // Handle BigQuery date format
    const dateValue = typeof dateStr === 'object' && dateStr.value ? dateStr.value : dateStr
    const date = new Date(dateValue)
    return isNaN(date.getTime()) ? String(dateValue) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

  const getSiteColor = (index: number) => {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6']
    return colors[index % colors.length]
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

  // Get site-specific or aggregated metrics
  const displayMetrics = selectedSite === 'all' 
    ? data.summary 
    : data.sites?.find((s: any) => s.id === selectedSite) || data.summary

  return (
    <div className="space-y-6">
      {/* Site Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building className="h-5 w-5" />
            Traffic Overview
          </h3>
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites (Aggregate)</SelectItem>
              {data.availableSites?.map((site: any) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedSite === 'all' && (
          <Badge variant="outline" className="text-sm">
            {data.sites?.length || 0} sites tracked
          </Badge>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(displayMetrics?.total_users || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(displayMetrics?.new_users || 0)} new users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(displayMetrics?.total_sessions || 0)}</div>
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
            <div className="text-2xl font-bold">{formatNumber(displayMetrics?.page_views || 0)}</div>
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
              {displayMetrics?.page_views && displayMetrics?.total_sessions 
                ? (displayMetrics.page_views / displayMetrics.total_sessions).toFixed(1)
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
            <div className="text-2xl font-bold">{formatNumber(displayMetrics?.total_conversions || 0)}</div>
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
              {displayMetrics?.total_conversions && displayMetrics?.total_sessions 
                ? formatPercent(displayMetrics.total_conversions / displayMetrics.total_sessions)
                : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              Session conversion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Site Performance Breakdown - Only show when viewing all sites */}
      {selectedSite === 'all' && data.sites && data.sites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Site Performance Breakdown</CardTitle>
            <CardDescription>Metrics across all tracked properties</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {data.sites.map((site: any, index: number) => (
                <Card key={site.id} className="border-l-4" style={{ borderLeftColor: getSiteColor(index) }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>{site.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {formatPercentage(safePercentage(site.total_sessions, data.summary?.total_sessions))}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Users:</span>
                      <span className="font-medium">{formatNumber(site.total_users || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Sessions:</span>
                      <span className="font-medium">{formatNumber(site.total_sessions || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Page Views:</span>
                      <span className="font-medium">{formatNumber(site.page_views || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Bounce Rate:</span>
                      <span className="font-medium">{formatPercent(site.avg_bounce_rate || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Conversions:</span>
                      <span className="font-medium">{formatNumber(site.total_conversions || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Traffic Trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Traffic Trend</CardTitle>
              <CardDescription>
                {trendView === 'aggregated' ? 'Combined traffic across all sites' : 'Traffic per individual site'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {selectedSite === 'all' && (
                <div className="flex gap-1">
                  <Button
                    variant={trendView === 'aggregated' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTrendView('aggregated')}
                  >
                    Aggregated
                  </Button>
                  <Button
                    variant={trendView === 'per-site' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTrendView('per-site')}
                  >
                    Per Site
                  </Button>
                </div>
              )}
              <div className="flex gap-1">
                <Button
                  variant={groupBy === 'day' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGroupBy('day')}
                >
                  Day
                </Button>
                <Button
                  variant={groupBy === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGroupBy('week')}
                >
                  Week
                </Button>
                <Button
                  variant={groupBy === 'month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGroupBy('month')}
                >
                  Month
                </Button>
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
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            {trendView === 'aggregated' || selectedSite !== 'all' ? (
              // Aggregated trend chart
              <LineChart data={data.aggregatedTrend?.map((item: any) => ({
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
                  angle={data.aggregatedTrend?.length > 20 ? -45 : 0}
                  textAnchor={data.aggregatedTrend?.length > 20 ? "end" : "middle"}
                  height={data.aggregatedTrend?.length > 20 ? 80 : 40}
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
                  dot={data.aggregatedTrend?.length <= 30}
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
            ) : (
              // Per-site trend chart
              <LineChart data={(() => {
                const dates = [...new Set(data.siteTrends?.map((item: any) => item.date))].sort()
                return dates.map((date: any) => {
                  const dataPoint: any = { date: formatDate(date) }
                  data.sites?.forEach((site: any) => {
                    const siteData = data.siteTrends?.find((t: any) => 
                      t.date === date && t.site_id === site.id
                    )
                    if (siteData) {
                      dataPoint[site.name] = viewMode === 'users' ? siteData.users :
                                             viewMode === 'sessions' ? siteData.sessions :
                                             siteData.page_views
                    }
                  })
                  return dataPoint
                })
              })()}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  angle={data.siteTrends?.length > 20 ? -45 : 0}
                  textAnchor={data.siteTrends?.length > 20 ? "end" : "middle"}
                  height={data.siteTrends?.length > 20 ? 80 : 40}
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
                <Legend />
                {data.sites?.map((site: any, index: number) => (
                  <Line 
                    key={site.id}
                    type="monotone" 
                    dataKey={site.name}
                    stroke={getSiteColor(index)}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Channels and Devices */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Channel Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Traffic Channels</CardTitle>
            <CardDescription>Session distribution by acquisition channel</CardDescription>
          </CardHeader>
          <CardContent>
            {data.channels && data.channels.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.channels || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => formatPercentage(safePercentage(entry.sessions, displayMetrics?.total_sessions))}
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
              </>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No channel data available for selected view
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Device Categories</CardTitle>
            <CardDescription>User distribution by device type</CardDescription>
          </CardHeader>
          <CardContent>
            {data.devices && data.devices.length > 0 ? (
              <>
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
              </>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No device data available for selected view
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tables Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Pages */}
        <Card>
          <CardHeader>
            <CardTitle>Top Pages</CardTitle>
            <CardDescription>Most visited pages on the site</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topPages && data.topPages.length > 0 ? (
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
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No page data available for selected view
              </div>
            )}
          </CardContent>
        </Card>

        {/* Traffic Sources */}
        <Card>
          <CardHeader>
            <CardTitle>Traffic Sources</CardTitle>
            <CardDescription>Where your visitors come from</CardDescription>
          </CardHeader>
          <CardContent>
            {data.sources && data.sources.length > 0 ? (
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
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No source data available for selected view
              </div>
            )}
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
                const percentage = safePercentage(country.sessions, displayMetrics?.total_sessions)
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