"use client"

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  componentName?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught an error:', {
      component: this.props.componentName,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })

    this.setState({
      error,
      errorInfo
    })
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <Card className="border-destructive">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle>Error Loading Component</CardTitle>
            </div>
            <CardDescription>
              {this.props.componentName && `Error in ${this.props.componentName}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                An error occurred while rendering this component. This has been logged for investigation.
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium">Error Details</summary>
                  <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
              <button
                onClick={this.handleReset}
                className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Try Again
              </button>
            </div>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}
