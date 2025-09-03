"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Upload, CheckCircle, XCircle } from "lucide-react"

interface SyncResult {
  success: boolean
  rowsProcessed: number
  error?: string
}

export function ExcelSyncManager() {
  const [loading, setLoading] = useState(false)
  const [lastSync, setLastSync] = useState<SyncResult | null>(null)
  const [status, setStatus] = useState<any>(null)

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/sync/excel')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Error checking sync status:', error)
    }
  }

  const triggerSync = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync/scheduled', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      const result = await response.json()
      setLastSync(result)
      
      if (result.success) {
        await checkStatus()
      }
    } catch (error) {
      console.error('Error triggering sync:', error)
      setLastSync({
        success: false,
        rowsProcessed: 0,
        error: 'Failed to trigger sync'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Excel Sync Manager
        </CardTitle>
        <CardDescription>
          Sync Excel spreadsheets from OneDrive to BigQuery
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={triggerSync} disabled={loading}>
            {loading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Syncing...' : 'Trigger Sync'}
          </Button>
          <Button variant="outline" onClick={checkStatus}>
            Check Status
          </Button>
        </div>

        {status && (
          <div className="space-y-2">
            <h4 className="font-medium">Configuration Status</h4>
            <div className="flex gap-2">
              <Badge variant={status.microsoftGraph ? "default" : "destructive"}>
                Microsoft Graph: {status.microsoftGraph ? "Configured" : "Not Configured"}
              </Badge>
              <Badge variant={status.bigQuery ? "default" : "destructive"}>
                BigQuery: {status.bigQuery ? "Configured" : "Not Configured"}
              </Badge>
            </div>
          </div>
        )}

        {lastSync && (
          <div className="space-y-2">
            <h4 className="font-medium">Last Sync Result</h4>
            <div className="flex items-center gap-2">
              {lastSync.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className={lastSync.success ? "text-green-600" : "text-red-600"}>
                {lastSync.success 
                  ? `Success: ${lastSync.rowsProcessed} rows processed`
                  : `Failed: ${lastSync.error}`
                }
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}