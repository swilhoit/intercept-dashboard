"use client"

import { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { validateChartData, logValidationErrors } from '@/lib/data-validation'
import { Loader2, AlertCircle } from 'lucide-react'

interface SafeChartProps {
  data: any[]
  loading?: boolean
  title?: string
  description?: string
  children: ReactNode
  componentName?: string
  minDataPoints?: number
  emptyMessage?: string
}

/**
 * SafeChart wrapper ensures data is validated before rendering chart components
 * Provides loading states, empty states, and error handling
 */
export function SafeChart({
  data,
  loading = false,
  title,
  description,
  children,
  componentName = 'Chart',
  minDataPoints = 0,
  emptyMessage = 'No data available'
}: SafeChartProps) {
  // Loading state
  if (loading) {
    return (
      <Card>
        {(title || description) && (
          <CardHeader>
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent className="h-[300px] flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading data...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Validate data
  const validation = validateChartData(data)

  // Log validation errors in development
  if (!validation.isValid) {
    logValidationErrors(componentName, validation.errors)
  }

  // Check if we have enough data
  if (validation.data.length < minDataPoints) {
    return (
      <Card>
        {(title || description) && (
          <CardHeader>
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent className="h-[300px] flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{emptyMessage}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render children with validated data
  return <>{children}</>
}
