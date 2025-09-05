"use client"

import { useState, useEffect } from "react"
import { DateRange } from "react-day-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Search, 
  TrendingUp, 
  Eye, 
  MousePointer, 
  BarChart3, 
  ExternalLink,
  Globe
} from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

interface SearchConsoleAnalyticsProps {
  dateRange: DateRange | undefined
}

interface SiteMetrics {
  site: string
  site_name: string
  total_clicks: number
  total_impressions: number
  avg_position: number
  ctr: number
  total_queries: number
  total_pages: number
  error?: string
}

interface AggregatedMetrics {
  total_clicks: number
  total_impressions: number
  avg_position: number
  ctr: number
  total_queries: number
  total_pages: number
  site_count: number
}

interface TrendData {
  date: string
  site: string
  site_name: string
  clicks: number
  impressions: number
  avg_position: number
  ctr: number
}

interface QueryData {
  query: string
  site: string
  site_name: string
  clicks: number
  impressions: number
  avg_position: number
  ctr: number
  sites?: string[]
  site_count?: number
}

interface PageData {
  page: string
  page_path: string
  full_url: string
  site: string
  site_name: string
  clicks: number
  impressions: number
  avg_position: number
  ctr: number
}

export function SearchConsoleAnalytics({ dateRange }: SearchConsoleAnalyticsProps) {
  const [loading, setLoading] = useState(true)
  const [selectedSite, setSelectedSite] = useState<string>("all")
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [overviewData, setOverviewData] = useState<{
    aggregated: AggregatedMetrics
    sites: SiteMetrics[]
    trends: TrendData[]
  } | null>(null)
  const [topQueries, setTopQueries] = useState<QueryData[]>([])
  const [topPages, setTopPages] = useState<PageData[]>([])

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
    if (selectedSite !== "all") {
      params.append("site", selectedSite)
    }
    params.append("groupBy", groupBy)

    try {
      const [overviewRes, queriesRes, pagesRes] = await Promise.all([
        fetch(`/api/search-console/overview?${params}`),
        fetch(`/api/search-console/queries?${params}`),
        fetch(`/api/search-console/pages?${params}`)
      ])

      const [overviewResult, queriesResult, pagesResult] = await Promise.all([
        overviewRes.json(),
        queriesRes.json(),
        pagesRes.json()
      ])

      // Handle error responses
      console.log('Search Console API responses:', { overviewResult, queriesResult, pagesResult })
      setOverviewData(overviewResult && !overviewResult.error ? overviewResult : null)
      setTopQueries(queriesResult && Array.isArray(queriesResult.queries) ? queriesResult.queries : [])
      setTopPages(pagesResult && Array.isArray(pagesResult.pages) ? pagesResult.pages : [])
    } catch (error) {
      console.error("Error fetching search console data:", error)
      setOverviewData(null)
      setTopQueries([])
      setTopPages([])
    } finally {
      setLoading(false)
    }
  }

  // Prepare chart data
  const chartData = overviewData?.trends?.reduce((acc: any[], trend: any) => {
    // Handle date format - convert BigQuery date to JS date string
    const dateStr = trend.date ? (typeof trend.date === 'object' && trend.date.value ? new Date(trend.date.value).toISOString().split('T')[0] : trend.date) : '';
    const existingDate = acc.find(item => item.date === dateStr)
    if (existingDate) {
      existingDate.clicks += trend.clicks || 0
      existingDate.impressions += trend.impressions || 0
      existingDate.ctr = existingDate.impressions > 0 ? (existingDate.clicks / existingDate.impressions) * 100 : 0
    } else {
      acc.push({
        date: dateStr,
        clicks: trend.clicks || 0,
        impressions: trend.impressions || 0,
        ctr: trend.ctr || 0,
        avg_position: trend.avg_position || 0
      })
    }
    return acc
  }, []) || []

  // Available sites for the dropdown
  const availableSites = [
    { value: "all", label: "All Sites" },
    { value: "brickanew.com", label: "BrickAnew" },
    { value: "heatilatorfireplacedoors.com", label: "Heatilator Fireplace Doors" },
    { value: "superiorfireplacedoors.com", label: "Superior Fireplace Doors" },
    { value: "waterwisegroup.com", label: "WaterWise Group" },
    { value: "majesticfireplacedoors.com", label: "Majestic Fireplace Doors" },
    { value: "fireplacepainting.com", label: "Fireplace Painting" },
    { value: "fireplaces.net", label: "Fireplaces.net" }
  ]

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Search Console Analytics</h3>
          <div className="animate-pulse bg-gray-200 h-10 w-48 rounded"></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with site selector */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          <h3 className="text-lg font-medium">Search Console Analytics</h3>
        </div>
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select site" />
          </SelectTrigger>
          <SelectContent>
            {availableSites.map(site => (
              <SelectItem key={site.value} value={site.value}>
                {site.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overviewData?.aggregated?.total_clicks?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Across {overviewData?.aggregated?.site_count || 0} sites
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Impressions</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overviewData?.aggregated?.total_impressions?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overviewData?.aggregated?.total_queries?.toLocaleString() || 0} unique queries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average CTR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overviewData?.aggregated?.ctr?.toFixed(2) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Position: {overviewData?.aggregated?.avg_position?.toFixed(1) || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pages</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overviewData?.aggregated?.total_pages?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Pages with impressions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Site Breakdown Table */}
      {selectedSite === "all" && overviewData?.sites && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Site Performance Breakdown
            </CardTitle>
            <CardDescription>
              Search Console metrics across all connected websites
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Avg Position</TableHead>
                  <TableHead className="text-right">Queries</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overviewData.sites.map((site) => (
                  <TableRow key={site.site}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{site.site_name}</div>
                        <div className="text-sm text-muted-foreground">{site.site}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {site.total_clicks?.toLocaleString() || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {site.total_impressions?.toLocaleString() || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {site.ctr?.toFixed(2) || 0}%
                    </TableCell>
                    <TableCell className="text-right">
                      {site.avg_position?.toFixed(1) || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {site.total_queries?.toLocaleString() || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {site.total_pages?.toLocaleString() || 0}
                    </TableCell>
                    <TableCell className="text-center">
                      {site.error ? (
                        <Badge variant="destructive" className="text-xs">
                          Error
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                          Connected
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Clicks & Impressions Trend</CardTitle>
                <CardDescription>Performance over time</CardDescription>
              </div>
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
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  fontSize={12}
                  tickFormatter={(value) => {
                    if (!value) return ''
                    const date = new Date(value)
                    return isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }}
                />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip 
                  labelFormatter={(value) => {
                    if (!value) return ''
                    const date = new Date(value)
                    return isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  }}
                  formatter={(value: any, name: string) => [
                    typeof value === 'number' ? value.toLocaleString() : value,
                    name === 'clicks' ? 'Clicks' : name === 'impressions' ? 'Impressions' : name
                  ]}
                />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="clicks" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  name="clicks"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="impressions" 
                  stroke="#82ca9d" 
                  strokeWidth={2}
                  name="impressions"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CTR & Average Position</CardTitle>
            <CardDescription>Click-through rate and search position trends</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  fontSize={12}
                  tickFormatter={(value) => {
                    if (!value) return ''
                    const date = new Date(value)
                    return isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }}
                />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 50]} reversed />
                <Tooltip 
                  labelFormatter={(value) => {
                    if (!value) return ''
                    const date = new Date(value)
                    return isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  }}
                  formatter={(value: any, name: string) => [
                    name === 'ctr' ? `${Number(value).toFixed(2)}%` : Number(value).toFixed(1),
                    name === 'ctr' ? 'CTR' : 'Avg Position'
                  ]}
                />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="ctr" 
                  stroke="#ff7300" 
                  strokeWidth={2}
                  name="ctr"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="avg_position" 
                  stroke="#8dd1e1" 
                  strokeWidth={2}
                  name="avg_position"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <Tabs defaultValue="queries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queries">Top Queries</TabsTrigger>
          <TabsTrigger value="pages">Top Pages</TabsTrigger>
        </TabsList>

        <TabsContent value="queries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Search Queries</CardTitle>
              <CardDescription>
                Highest performing search queries by clicks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Avg Position</TableHead>
                    {selectedSite === "all" && <TableHead>Sites</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topQueries.slice(0, 20).map((query, index) => (
                    <TableRow key={`${query.query}-${index}`}>
                      <TableCell className="font-medium max-w-xs truncate">
                        {query.query}
                      </TableCell>
                      <TableCell className="text-right">
                        {query.clicks?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {query.impressions?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {query.ctr?.toFixed(2) || 0}%
                      </TableCell>
                      <TableCell className="text-right">
                        {query.avg_position?.toFixed(1) || 0}
                      </TableCell>
                      {selectedSite === "all" && (
                        <TableCell>
                          <Badge variant="secondary">
                            {query.site_count || 1} site{(query.site_count || 1) > 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Landing Pages</CardTitle>
              <CardDescription>
                Highest performing pages by clicks from search
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Avg Position</TableHead>
                    <TableHead>Site</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPages.slice(0, 20).map((page, index) => (
                    <TableRow key={`${page.page}-${index}`}>
                      <TableCell className="font-medium max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{page.page_path}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0"
                            onClick={() => window.open(page.full_url, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {page.clicks?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {page.impressions?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {page.ctr?.toFixed(2) || 0}%
                      </TableCell>
                      <TableCell className="text-right">
                        {page.avg_position?.toFixed(1) || 0}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {page.site_name}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
