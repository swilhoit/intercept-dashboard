"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  Activity,
  TrendingUp,
  Calendar,
  BarChart3,
  FileText,
  GitBranch,
  ArrowRight
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
    e2e_total_checks?: number;
    e2e_passed?: number;
    e2e_warnings?: number;
    e2e_errors?: number;
    e2e_avg_response_time_ms?: number;
    pipeline_total_nodes?: number;
    pipeline_healthy_nodes?: number;
    pipeline_warning_nodes?: number;
    pipeline_error_nodes?: number;
    pipeline_total_edges?: number;
    pipeline_active_edges?: number;
    pipeline_stale_edges?: number;
    pipeline_broken_edges?: number;
    diagnostic_details?: any;
  }>;
  summary: {
    total_runs: number;
    healthy_runs: number;
    health_percentage: number;
    avg_7day_revenue: number;
  };
}

interface E2ECheck {
  name: string;
  layer: 'source' | 'api' | 'integration';
  status: 'healthy' | 'warning' | 'error';
  message: string;
  responseTime?: number;
  dataReturned?: boolean;
  recordCount?: number;
  endpoint?: string;
  errors?: string[];
}

interface E2EData {
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'error';
  checks: E2ECheck[];
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    errors: number;
    avgResponseTime: number;
  };
}

interface PipelineNode {
  id: string;
  name: string;
  type: 'source' | 'scheduler' | 'raw_table' | 'master_table' | 'api' | 'dashboard';
  status: 'healthy' | 'warning' | 'error' | 'idle';
  metadata: {
    lastUpdate?: string;
    recordCount?: number;
    dataFreshness?: string;
    nextRun?: string;
    issues?: string[];
    metrics?: Record<string, any>;
  };
  dependencies: string[];
}

interface PipelineFlowData {
  timestamp: string;
  nodes: PipelineNode[];
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    status: 'active' | 'stale' | 'broken';
  }>;
  stages: {
    sources: PipelineNode[];
    schedulers: PipelineNode[];
    rawTables: PipelineNode[];
    masterTables: PipelineNode[];
    apis: PipelineNode[];
    dashboards: PipelineNode[];
  };
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<PipelineCheck | null>(null)
  const [schedulers, setSchedulers] = useState<SchedulerData | null>(null)
  const [historical, setHistorical] = useState<HistoricalData | null>(null)
  const [e2e, setE2e] = useState<E2EData | null>(null)
  const [pipelineFlow, setPipelineFlow] = useState<PipelineFlowData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDiagnostics = async () => {
    setLoading(true)
    setError(null)
    try {
      const [pipelineRes, schedulersRes, historyRes, e2eRes, flowRes] = await Promise.all([
        fetch('/api/diagnostics/pipeline'),
        fetch('/api/diagnostics/schedulers'),
        fetch('/api/diagnostics/history?days=30'),
        fetch('/api/diagnostics/e2e'),
        fetch('/api/diagnostics/pipeline-flow')
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

      if (e2eRes.ok) {
        const e2eResult = await e2eRes.json()
        setE2e(e2eResult)
      }

      if (flowRes.ok) {
        const flowResult = await flowRes.json()
        setPipelineFlow(flowResult)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDiagnostics()
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
      <Tabs defaultValue="flow" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="flow" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Pipeline Flow
          </TabsTrigger>
          <TabsTrigger value="e2e" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            End-to-End
          </TabsTrigger>
          <TabsTrigger value="live" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Data Sources
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Historical Logs
          </TabsTrigger>
        </TabsList>

        {/* Pipeline Flow Visualization Tab */}
        <TabsContent value="flow" className="space-y-6 mt-6">
          {pipelineFlow ? (
            <>
              {/* Pipeline Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Data Pipeline Flow</CardTitle>
                  <CardDescription>
                    Complete data journey from sources to dashboards
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span>Healthy</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <span>Warning</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span>Error</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                      <span>Idle</span>
                    </div>
                  </div>

                  {/* Pipeline Flow Visualization */}
                  <div className="flex gap-8 overflow-x-auto pb-4">
                    {/* Sources Column */}
                    <div className="flex-shrink-0" style={{ minWidth: '200px' }}>
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        Data Sources
                      </h3>
                      <div className="space-y-3">
                        {pipelineFlow.stages.sources.map((node) => (
                          <div
                            key={node.id}
                            className={`p-3 rounded-lg border-2 ${
                              node.status === 'healthy' ? 'border-green-500 bg-green-50' :
                              node.status === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                              node.status === 'error' ? 'border-red-500 bg-red-50' :
                              'border-gray-300 bg-gray-50'
                            }`}
                          >
                            <div className="font-medium text-sm">{node.name}</div>
                            {node.metadata.dataFreshness && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {node.metadata.dataFreshness}
                              </div>
                            )}
                            {node.metadata.recordCount !== undefined && (
                              <div className="text-xs text-muted-foreground">
                                {node.metadata.recordCount.toLocaleString()} records
                              </div>
                            )}
                            {node.metadata.issues && node.metadata.issues.length > 0 && (
                              <div className="text-xs text-red-600 mt-1">
                                {node.metadata.issues[0]}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Arrow Separator */}
                    <div className="flex items-center justify-center flex-shrink-0">
                      <ArrowRight className="h-8 w-8 text-gray-400" />
                    </div>

                    {/* Master Tables Column */}
                    <div className="flex-shrink-0" style={{ minWidth: '200px' }}>
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Master Tables
                      </h3>
                      <div className="space-y-3">
                        {pipelineFlow.stages.masterTables.map((node) => (
                          <div
                            key={node.id}
                            className={`p-3 rounded-lg border-2 ${
                              node.status === 'healthy' ? 'border-green-500 bg-green-50' :
                              node.status === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                              node.status === 'error' ? 'border-red-500 bg-red-50' :
                              'border-gray-300 bg-gray-50'
                            }`}
                          >
                            <div className="font-medium text-sm">{node.name}</div>
                            {node.metadata.dataFreshness && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {node.metadata.dataFreshness}
                              </div>
                            )}
                            {node.metadata.recordCount !== undefined && (
                              <div className="text-xs text-muted-foreground">
                                {node.metadata.recordCount.toLocaleString()} records
                              </div>
                            )}
                            <div className="text-xs text-blue-600 mt-1">
                              Aggregates {node.dependencies.length} sources
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Arrow Separator */}
                    <div className="flex items-center justify-center flex-shrink-0">
                      <ArrowRight className="h-8 w-8 text-gray-400" />
                    </div>

                    {/* APIs Column */}
                    <div className="flex-shrink-0" style={{ minWidth: '200px' }}>
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        API Endpoints
                      </h3>
                      <div className="space-y-3">
                        {pipelineFlow.stages.apis.map((node) => (
                          <div
                            key={node.id}
                            className={`p-3 rounded-lg border-2 ${
                              node.status === 'healthy' ? 'border-green-500 bg-green-50' :
                              node.status === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                              node.status === 'error' ? 'border-red-500 bg-red-50' :
                              'border-gray-300 bg-gray-50'
                            }`}
                          >
                            <div className="font-medium text-sm">{node.name}</div>
                            {node.metadata.metrics?.endpoint && (
                              <div className="text-xs text-muted-foreground mt-1 font-mono">
                                {node.metadata.metrics.endpoint}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Arrow Separator */}
                    <div className="flex items-center justify-center flex-shrink-0">
                      <ArrowRight className="h-8 w-8 text-gray-400" />
                    </div>

                    {/* Dashboards Column */}
                    <div className="flex-shrink-0" style={{ minWidth: '200px' }}>
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Dashboards
                      </h3>
                      <div className="space-y-3">
                        {pipelineFlow.stages.dashboards.map((node) => (
                          <div
                            key={node.id}
                            className={`p-3 rounded-lg border-2 ${
                              node.status === 'healthy' ? 'border-green-500 bg-green-50' :
                              node.status === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                              node.status === 'error' ? 'border-red-500 bg-red-50' :
                              'border-gray-300 bg-gray-50'
                            }`}
                          >
                            <div className="font-medium text-sm">{node.name}</div>
                            <div className="text-xs text-purple-600 mt-1">
                              {node.dependencies.length} API dependencies
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pipeline Edges/Connections Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Data Flow Connections</CardTitle>
                  <CardDescription>
                    Status of data flowing between pipeline stages
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pipelineFlow.edges.slice(0, 15).map((edge, i) => {
                        const fromNode = pipelineFlow.nodes.find(n => n.id === edge.from);
                        const toNode = pipelineFlow.nodes.find(n => n.id === edge.to);
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-medium text-sm">
                              {fromNode?.name || edge.from}
                            </TableCell>
                            <TableCell className="font-medium text-sm">
                              {toNode?.name || edge.to}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{edge.label || 'connects'}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                edge.status === 'active' ? 'default' :
                                edge.status === 'stale' ? 'secondary' : 'destructive'
                              }>
                                {edge.status.toUpperCase()}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Pipeline Health Summary */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Pipeline Nodes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{pipelineFlow.nodes.length}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {pipelineFlow.nodes.filter(n => n.status === 'healthy').length} healthy,{' '}
                      {pipelineFlow.nodes.filter(n => n.status === 'warning').length} warnings,{' '}
                      {pipelineFlow.nodes.filter(n => n.status === 'error').length} errors
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Data Connections</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{pipelineFlow.edges.length}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {pipelineFlow.edges.filter(e => e.status === 'active').length} active,{' '}
                      {pipelineFlow.edges.filter(e => e.status === 'stale').length} stale,{' '}
                      {pipelineFlow.edges.filter(e => e.status === 'broken').length} broken
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Pipeline Stages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs space-y-1">
                      <div>{pipelineFlow.stages.sources.length} Sources</div>
                      <div>{pipelineFlow.stages.masterTables.length} Master Tables</div>
                      <div>{pipelineFlow.stages.apis.length} APIs</div>
                      <div>{pipelineFlow.stages.dashboards.length} Dashboards</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Loading pipeline flow...</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* End-to-End Testing Tab */}
        <TabsContent value="e2e" className="space-y-6 mt-6">
          {e2e ? (
            <>
              {/* E2E Summary */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Checks</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{e2e.summary.totalChecks}</div>
                    <p className="text-xs text-muted-foreground">Full stack tests</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Passed</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{e2e.summary.passed}</div>
                    <p className="text-xs text-muted-foreground">
                      {((e2e.summary.passed / e2e.summary.totalChecks) * 100).toFixed(0)}% success rate
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Issues</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {e2e.summary.warnings + e2e.summary.errors}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {e2e.summary.warnings} warnings, {e2e.summary.errors} errors
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{e2e.summary.avgResponseTime}ms</div>
                    <p className="text-xs text-muted-foreground">API response time</p>
                  </CardContent>
                </Card>
              </div>

              {/* API Endpoints */}
              <Card>
                <CardHeader>
                  <CardTitle>API Endpoint Tests</CardTitle>
                  <CardDescription>Validation of all critical API endpoints</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Response Time</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {e2e.checks
                        .filter(c => c.layer === 'api')
                        .map((check, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">
                              <div className="flex flex-col">
                                <span>{check.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">
                                  {check.endpoint}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{getStatusBadge(check.status)}</TableCell>
                            <TableCell>
                              {check.responseTime !== undefined ? `${check.responseTime}ms` : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {check.recordCount !== undefined ? check.recordCount.toLocaleString() : 'N/A'}
                            </TableCell>
                            <TableCell className={check.status === 'healthy' ? 'text-green-600' : check.status === 'warning' ? 'text-yellow-600' : 'text-red-600'}>
                              {check.message}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Integration Tests */}
              <Card>
                <CardHeader>
                  <CardTitle>Data Flow Integration Tests</CardTitle>
                  <CardDescription>End-to-end validation from BigQuery → API → Frontend</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {e2e.checks
                      .filter(c => c.layer === 'integration')
                      .map((check, i) => (
                        <div key={i} className="flex items-start gap-4 p-4 rounded-lg border">
                          <div className="mt-1">
                            {check.status === 'healthy' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                            {check.status === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                            {check.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">{check.name}</div>
                            <div className="text-sm text-muted-foreground mt-1">{check.message}</div>
                            {check.errors && check.errors.length > 0 && (
                              <div className="text-xs text-red-500 mt-2">
                                {check.errors.map((err, j) => (
                                  <div key={j}>• {err}</div>
                                ))}
                              </div>
                            )}
                          </div>
                          {getStatusBadge(check.status)}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Loading end-to-end tests...</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

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

          {/* Date Gap Summary */}
          {Object.values(data.sources).some(s => s.metrics?.dateGaps?.totalMissing > 0) && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-yellow-600" />
                  Date Gaps Detected
                </CardTitle>
                <CardDescription>Sources with missing dates in the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.values(data.sources)
                    .filter(s => s.metrics?.dateGaps?.totalMissing > 0)
                    .map((source, i) => (
                      <div key={i} className="border-l-4 border-yellow-500 pl-4 py-2">
                        <div className="font-medium">{source.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {source.metrics?.dateGaps?.recentMissing && source.metrics.dateGaps.recentMissing > 0 && (
                            <div className="text-red-600 font-medium">
                              ⚠️ {source.metrics.dateGaps.recentMissing} missing dates in last 7 days: {source.metrics.dateGaps.recentMissingDates}
                            </div>
                          )}
                          <div className="text-yellow-700">
                            Total: {source.metrics?.dateGaps?.totalMissing || 0} missing dates in last 30 days
                          </div>
                          {source.metrics?.dateGaps?.allMissingDates && (
                            <div className="text-xs mt-1 text-gray-600">
                              Missing: {source.metrics.dateGaps.allMissingDates}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                    <TableHead>7-Day Metrics</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.sources).map(([key, source]) => {
                    // Render different metrics based on source type
                    let metricsDisplay: string | React.ReactElement = 'N/A';
                    if (source.metrics?.last7DaysRevenue) {
                      // Sales source
                      metricsDisplay = formatCurrency(source.metrics.last7DaysRevenue);
                    } else if (source.metrics?.last7DaysSpend !== undefined) {
                      // Amazon Ads source
                      metricsDisplay = (
                        <div className="text-xs">
                          <div>Spend: {formatCurrency(source.metrics.last7DaysSpend)}</div>
                          <div>Clicks: {source.metrics.totalClicks?.toLocaleString() || 0}</div>
                          <div>Impr: {(source.metrics.totalImpressions || 0).toLocaleString()}</div>
                        </div>
                      );
                    } else if (source.metrics?.last7DaysSessions !== undefined) {
                      // GA4 source
                      metricsDisplay = (
                        <div className="text-xs">
                          <div>Sessions: {source.metrics.last7DaysSessions?.toLocaleString() || 0}</div>
                          <div>Users: {source.metrics.totalUsers?.toLocaleString() || 0}</div>
                          <div>Conv: {source.metrics.totalConversions?.toLocaleString() || 0}</div>
                        </div>
                      );
                    }

                    return (
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
                          {metricsDisplay}
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
                    );
                  })}
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
            <>
              {/* Overview Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Health Checks</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{historical.summary.total_runs}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Automated diagnostic runs
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {historical.summary.health_percentage.toFixed(1)}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {historical.summary.healthy_runs} of {historical.summary.total_runs} runs healthy
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg 7-Day Revenue</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(historical.summary.avg_7day_revenue)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Rolling average
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Latest Check</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm font-bold">
                      {new Date(historical.logs[0].timestamp).toLocaleString()}
                    </div>
                    <Badge variant={historical.logs[0].overall_status === 'healthy' ? 'default' : 'destructive'} className="mt-2">
                      {historical.logs[0].overall_status.toUpperCase()}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              {/* Health Trend Visualization */}
              <Card>
                <CardHeader>
                  <CardTitle>System Health Trend (Last 10 Runs)</CardTitle>
                  <CardDescription>Visual timeline of diagnostic health status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 h-32">
                    {historical.logs.slice(0, 10).reverse().map((log, i) => {
                      const healthScore = (
                        (log.data_sources_healthy || 0) * 100 / 10 +
                        (log.e2e_passed || 0) * 100 / (log.e2e_total_checks || 1) +
                        (log.pipeline_healthy_nodes || 0) * 100 / (log.pipeline_total_nodes || 1)
                      ) / 3;

                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className={`w-full rounded-t ${
                              log.overall_status === 'healthy' ? 'bg-green-500' :
                              log.overall_status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ height: `${healthScore}%` }}
                            title={`${new Date(log.timestamp).toLocaleString()}: ${log.overall_status}`}
                          />
                          <div className="text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Metrics Grid */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* E2E Test Success Rate */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">E2E Test Success Rate</CardTitle>
                    <CardDescription>Last 10 diagnostic runs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {historical.logs.slice(0, 10).map((log, i) => {
                        const total = log.e2e_total_checks || 0;
                        const passed = log.e2e_passed || 0;
                        const successRate = total > 0 ? (passed / total) * 100 : 0;

                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground w-20">
                              {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </div>
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  successRate === 100 ? 'bg-green-500' :
                                  successRate >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${successRate}%` }}
                              />
                            </div>
                            <div className="text-xs font-medium w-12 text-right">
                              {successRate.toFixed(0)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Pipeline Health */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Pipeline Node Health</CardTitle>
                    <CardDescription>Healthy nodes over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {historical.logs.slice(0, 10).map((log, i) => {
                        const total = log.pipeline_total_nodes || 0;
                        const healthy = log.pipeline_healthy_nodes || 0;
                        const healthRate = total > 0 ? (healthy / total) * 100 : 0;

                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground w-20">
                              {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </div>
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  healthRate === 100 ? 'bg-green-500' :
                                  healthRate >= 90 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${healthRate}%` }}
                              />
                            </div>
                            <div className="text-xs font-medium w-12 text-right">
                              {healthy}/{total}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* API Response Time */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">API Response Time</CardTitle>
                    <CardDescription>Average E2E response time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {historical.logs.slice(0, 10).map((log, i) => {
                        const responseTime = log.e2e_avg_response_time_ms || 0;
                        const maxTime = 3000; // 3 seconds max for scale
                        const percentage = Math.min((responseTime / maxTime) * 100, 100);

                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground w-20">
                              {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </div>
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  responseTime < 500 ? 'bg-green-500' :
                                  responseTime < 1000 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <div className="text-xs font-medium w-12 text-right">
                              {responseTime}ms
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Logs Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Diagnostic Logs</CardTitle>
                  <CardDescription>Complete history of all diagnostic runs</CardDescription>
                </CardHeader>
                <CardContent>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sources</TableHead>
                      <TableHead>Consistency</TableHead>
                      <TableHead>E2E Tests</TableHead>
                      <TableHead>Pipeline Flow</TableHead>
                      <TableHead>7d Revenue</TableHead>
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
                        <TableCell className="text-xs">
                          <div>{log.data_sources_healthy || 0} healthy</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{log.consistency_checks_passed || 0} passed</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.e2e_total_checks ? (
                            <div>
                              <div className="text-green-600">{log.e2e_passed || 0} passed</div>
                              {(log.e2e_warnings || 0) + (log.e2e_errors || 0) > 0 && (
                                <div className="text-red-600">
                                  {(log.e2e_warnings || 0) + (log.e2e_errors || 0)} issues
                                </div>
                              )}
                              <div className="text-muted-foreground">
                                {log.e2e_avg_response_time_ms || 0}ms avg
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.pipeline_total_nodes ? (
                            <div>
                              <div className="text-green-600">{log.pipeline_healthy_nodes || 0} healthy nodes</div>
                              {(log.pipeline_warning_nodes || 0) + (log.pipeline_error_nodes || 0) > 0 && (
                                <div className="text-yellow-600">
                                  {(log.pipeline_warning_nodes || 0) + (log.pipeline_error_nodes || 0)} issues
                                </div>
                              )}
                              {(log.pipeline_broken_edges || 0) > 0 && (
                                <div className="text-red-600">
                                  {log.pipeline_broken_edges} broken edges
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatCurrency(log.total_7day_revenue || 0)}
                        </TableCell>
                        <TableCell className="text-xs max-w-md">
                          {log.issues_detected ? (
                            <div className="text-red-500 whitespace-pre-wrap text-xs">
                              {log.issues_detected.split(' | ').slice(0, 3).map((issue, j) => (
                                <div key={j} className="mb-1">{issue}</div>
                              ))}
                              {log.issues_detected.split(' | ').length > 3 && (
                                <div className="text-muted-foreground italic">
                                  +{log.issues_detected.split(' | ').length - 3} more issues
                                </div>
                              )}
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
            </>
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
      </Tabs>
    </div>
  )
}
