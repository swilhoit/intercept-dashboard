"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ReactMarkdown from "react-markdown"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  Activity,
  TrendingUp,
  Calendar,
  Sparkles,
  BarChart3,
  FileText
} from "lucide-react"

interface DataSourceCheck {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  lastSync: string | null;
  rowCount: number;
  dateRange: { earliest: string | null; latest: string | null };
  issues: string[];
  metrics?: Record<string, any>;
}

interface PipelineCheck {
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'error';
  sources: Record<string, DataSourceCheck>;
  masterTables: Record<string, DataSourceCheck>;
  consistency: {
    status: 'healthy' | 'warning' | 'error';
    checks: Array<{
      name: string;
      passed: boolean;
      message: string;
      expected?: any;
      actual?: any;
    }>;
  };
}

interface SchedulerData {
  timestamp: string;
  schedulers: Array<{
    name: string;
    state: string;
    schedule: string;
    lastRun: string | null;
    nextRun: string | null;
    target: string;
    status: 'active' | 'paused' | 'error';
  }>;
  summary: {
    total: number;
    active: number;
    paused: number;
    error: number;
  };
}

interface HistoricalData {
  logs: Array<{
    timestamp: string;
    overall_status: string;
    total_7day_revenue: number;
    data_sources_healthy: number;
    consistency_checks_passed: number;
    issues_detected: string | null;
  }>;
  summary: {
    total_runs: number;
    healthy_runs: number;
    health_percentage: number;
    avg_7day_revenue: number;
  };
}

interface AIInsights {
  success: boolean;
  insights: string;
  metadata: {
    timestamp: string;
    execution_time_ms: number;
    model: string;
  };
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<PipelineCheck | null>(null)
  const [schedulers, setSchedulers] = useState<SchedulerData | null>(null)
  const [historical, setHistorical] = useState<HistoricalData | null>(null)
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDiagnostics = async () => {
    setLoading(true)
    setError(null)
    try {
      const [pipelineRes, schedulersRes, historyRes] = await Promise.all([
        fetch('/api/diagnostics/pipeline'),
        fetch('/api/diagnostics/schedulers'),
        fetch('/api/diagnostics/history?days=30')
      ])

      if (!pipelineRes.ok) throw new Error('Failed to fetch pipeline diagnostics')
      const pipelineResult = await pipelineRes.json()
      setData(pipelineResult)

      if (schedulersRes.ok) {
        const schedulersResult = await schedulersRes.json()
        setSchedulers(schedulersResult)
      }

      if (historyRes.ok) {
        const historyResult = await historyRes.json()
        setHistorical(historyResult)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchAIInsights = async () => {
    setLoadingInsights(true)
    try {
      const res = await fetch('/api/diagnostics/insights')
      if (res.ok) {
        const insights = await res.json()
        setAiInsights(insights)
      }
    } catch (err: any) {
      console.error('Failed to fetch AI insights:', err)
    } finally {
      setLoadingInsights(false)
    }
  }

  useEffect(() => {
    fetchDiagnostics()
    fetchAIInsights()
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchDiagnostics, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const getStatusIcon = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
    }
  }

  const getStatusBadge = (status: 'healthy' | 'warning' | 'error') => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      healthy: 'default',
      warning: 'secondary',
      error: 'destructive'
    }
    return <Badge variant={variants[status]}>{status.toUpperCase()}</Badge>
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleString()
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Running diagnostics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button onClick={fetchDiagnostics} className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Data Pipeline Diagnostics</h1>
          <p className="text-muted-foreground mt-1">
            Last updated: {formatDate(data.timestamp)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {getStatusIcon(data.overallStatus)}
          <div>
            <div className="text-sm text-muted-foreground">Overall Status</div>
            <div className="font-bold">{getStatusBadge(data.overallStatus)}</div>
          </div>
          <Button onClick={fetchDiagnostics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="live" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="live" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Live Diagnostics
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Historical Logs
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Insights
          </TabsTrigger>
        </TabsList>

        {/* Live Diagnostics Tab */}
        <TabsContent value="live" className="space-y-6 mt-6">
          {/* Overall Metrics */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Data Sources</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.keys(data.sources).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {Object.values(data.sources).filter(s => s.status === 'healthy').length} healthy
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Master Tables</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.keys(data.masterTables).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {Object.values(data.masterTables).filter(s => s.status === 'healthy').length} healthy
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Consistency Checks</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.consistency.checks.filter(c => c.passed).length}/{data.consistency.checks.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Passed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue (7d)</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(
                    Object.values(data.sources)
                      .filter(s => s.metrics?.last7DaysRevenue)
                      .reduce((sum, s) => sum + (s.metrics?.last7DaysRevenue || 0), 0)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  From all sources
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Data Sources */}
          <Card>
            <CardHeader>
              <CardTitle>Data Sources</CardTitle>
              <CardDescription>Status of individual data source tables</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead>Row Count</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>7-Day Revenue</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.sources).map(([key, source]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{source.name}</TableCell>
                      <TableCell>{getStatusBadge(source.status)}</TableCell>
                      <TableCell className="text-sm">
                        {source.lastSync ? new Date(source.lastSync).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>{source.rowCount.toLocaleString()}</TableCell>
                      <TableCell className="text-sm">
                        {source.dateRange.earliest && source.dateRange.latest ? (
                          <div>
                            {new Date(source.dateRange.earliest).toLocaleDateString()} -<br />
                            {new Date(source.dateRange.latest).toLocaleDateString()}
                          </div>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {source.metrics?.last7DaysRevenue
                          ? formatCurrency(source.metrics.last7DaysRevenue)
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {source.issues.length > 0 ? (
                          <div className="text-xs text-red-500">
                            {source.issues.map((issue, i) => (
                              <div key={i}>{issue}</div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-green-500">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Master Tables */}
          <Card>
            <CardHeader>
              <CardTitle>Master Tables</CardTitle>
              <CardDescription>Aggregated master tables status</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Update</TableHead>
                    <TableHead>Row Count</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.masterTables).map(([key, table]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{table.name}</TableCell>
                      <TableCell>{getStatusBadge(table.status)}</TableCell>
                      <TableCell className="text-sm">
                        {table.lastSync ? new Date(table.lastSync).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>{table.rowCount.toLocaleString()}</TableCell>
                      <TableCell className="text-sm">
                        {table.dateRange.earliest && table.dateRange.latest ? (
                          <div>
                            {new Date(table.dateRange.earliest).toLocaleDateString()} -<br />
                            {new Date(table.dateRange.latest).toLocaleDateString()}
                          </div>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {table.issues.length > 0 ? (
                          <div className="text-xs text-red-500">
                            {table.issues.map((issue, i) => (
                              <div key={i}>{issue}</div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-green-500">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Consistency Checks */}
          <Card>
            <CardHeader>
              <CardTitle>Data Consistency Checks</CardTitle>
              <CardDescription>Verification that source data matches master tables</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.consistency.checks.map((check, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{check.name}</TableCell>
                      <TableCell>
                        {check.passed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className={check.passed ? 'text-green-600' : 'text-red-600'}>
                        {check.message}
                      </TableCell>
                      <TableCell className="text-sm">
                        {typeof check.expected === 'number'
                          ? formatCurrency(check.expected)
                          : check.expected ?? 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {typeof check.actual === 'number'
                          ? formatCurrency(check.actual)
                          : check.actual ?? 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Cloud Schedulers */}
          {schedulers && (
            <Card>
              <CardHeader>
                <CardTitle>Cloud Scheduler Jobs</CardTitle>
                <CardDescription>Status of automated data sync schedulers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Schedulers</div>
                    <div className="text-2xl font-bold">{schedulers.summary.total}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Active</div>
                    <div className="text-2xl font-bold text-green-600">{schedulers.summary.active}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Paused/Error</div>
                    <div className="text-2xl font-bold text-red-600">
                      {schedulers.summary.paused + schedulers.summary.error}
                    </div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead>Next Run</TableHead>
                      <TableHead>Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedulers.schedulers.map((scheduler, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{scheduler.name}</TableCell>
                        <TableCell>
                          <Badge variant={scheduler.status === 'active' ? 'default' : 'destructive'}>
                            {scheduler.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{scheduler.schedule}</TableCell>
                        <TableCell className="text-sm">
                          {scheduler.lastRun ? new Date(scheduler.lastRun).toLocaleString() : 'Never'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {scheduler.nextRun ? new Date(scheduler.nextRun).toLocaleString() : 'N/A'}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-xs">
                          {scheduler.target.split('/').pop()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Historical Logs Tab */}
        <TabsContent value="history" className="space-y-6 mt-6">
          {historical && historical.summary.total_runs > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Intelligence (Last 30 Days)</CardTitle>
                <CardDescription>Historical diagnostic logs and trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4 mb-6">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Health Checks</div>
                    <div className="text-2xl font-bold">{historical.summary.total_runs}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Automated diagnostic runs
                    </p>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">System Uptime</div>
                    <div className="text-2xl font-bold text-green-600">
                      {historical.summary.health_percentage.toFixed(1)}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {historical.summary.healthy_runs} of {historical.summary.total_runs} runs healthy
                    </p>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Avg 7-Day Revenue</div>
                    <div className="text-2xl font-bold">
                      {formatCurrency(historical.summary.avg_7day_revenue)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Rolling average
                    </p>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Latest Check</div>
                    <div className="text-sm font-bold">
                      {new Date(historical.logs[0].timestamp).toLocaleString()}
                    </div>
                    <Badge variant={historical.logs[0].overall_status === 'healthy' ? 'default' : 'destructive'} className="mt-2">
                      {historical.logs[0].overall_status.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Healthy Sources</TableHead>
                      <TableHead>Checks Passed</TableHead>
                      <TableHead>7-Day Revenue</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historical.logs.slice(0, 10).map((log, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.overall_status === 'healthy' ? 'default' : 'destructive'}>
                            {log.overall_status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.data_sources_healthy || 0}/8</TableCell>
                        <TableCell>{log.consistency_checks_passed || 0}/4</TableCell>
                        <TableCell>{formatCurrency(log.total_7day_revenue || 0)}</TableCell>
                        <TableCell className="text-xs">
                          {log.issues_detected ? (
                            <div className="text-red-500 truncate max-w-xs" title={log.issues_detected}>
                              {log.issues_detected.substring(0, 50)}...
                            </div>
                          ) : (
                            <span className="text-green-500">None</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No historical data available yet</p>
                  <p className="text-sm mt-2">Diagnostic logs will appear here once the daily logger runs</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* AI Insights Tab */}
        <TabsContent value="insights" className="space-y-6 mt-6">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <CardTitle>AI-Powered Insights</CardTitle>
                </div>
                <Button
                  onClick={fetchAIInsights}
                  disabled={loadingInsights}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingInsights ? 'animate-spin' : ''}`} />
                  Refresh Insights
                </Button>
              </div>
              <CardDescription>
                GPT-4 analysis of your data pipeline health and trends
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingInsights && !aiInsights && (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                  <span className="text-muted-foreground">AI analyzing your pipeline...</span>
                </div>
              )}

              {aiInsights && aiInsights.success && (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{aiInsights.insights}</ReactMarkdown>
                  <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                    Generated by {aiInsights.metadata.model} •
                    Analyzed at {new Date(aiInsights.metadata.timestamp).toLocaleString()} •
                    Execution time: {aiInsights.metadata.execution_time_ms}ms
                  </div>
                </div>
              )}

              {!loadingInsights && !aiInsights && (
                <div className="text-center py-8 text-muted-foreground">
                  Click "Refresh Insights" to generate AI analysis
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
