/**
 * Data validation utilities for ensuring data integrity before rendering
 */

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  data: any
}

/**
 * Validates that a value is a valid number (not null, undefined, NaN, or Infinity)
 */
export function isValidNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

/**
 * Coerce a value to a safe number, defaulting to 0 if invalid
 */
export function safeNumber(value: any, defaultValue: number = 0): number {
  if (isValidNumber(value)) return value
  const parsed = Number(value)
  return isValidNumber(parsed) ? parsed : defaultValue
}

/**
 * Validates chart data to ensure it's safe for Recharts
 */
export function validateChartData(data: any[]): ValidationResult {
  const errors: string[] = []

  if (!Array.isArray(data)) {
    return {
      isValid: false,
      errors: ['Data must be an array'],
      data: []
    }
  }

  if (data.length === 0) {
    return {
      isValid: true,
      errors: [],
      data: []
    }
  }

  // Validate each item in the array
  const validatedData = data.map((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`Item at index ${index} is not an object`)
      return null
    }

    // Check for null values in critical fields
    const hasNullValues = Object.entries(item).some(([key, value]) => {
      if (value === null || value === undefined) {
        errors.push(`Item at index ${index} has null/undefined value for key "${key}"`)
        return true
      }
      return false
    })

    if (hasNullValues) {
      // Return sanitized version
      return Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          key,
          value === null || value === undefined ? (typeof value === 'number' ? 0 : '') : value
        ])
      )
    }

    return item
  }).filter(Boolean)

  return {
    isValid: errors.length === 0,
    errors,
    data: validatedData
  }
}

/**
 * Validates revenue data for ChannelBreakdown component
 */
export interface RevenueData {
  amazonRevenue: number
  woocommerceRevenue: number
  shopifyRevenue?: number
}

export function validateRevenueData(data: Partial<RevenueData>): RevenueData {
  return {
    amazonRevenue: safeNumber(data.amazonRevenue),
    woocommerceRevenue: safeNumber(data.woocommerceRevenue),
    shopifyRevenue: safeNumber(data.shopifyRevenue)
  }
}

/**
 * Validates API summary response
 */
export interface SummaryData {
  total_revenue: number
  avg_daily_sales: number
  days_with_sales: number
  amazon_revenue: number
  woocommerce_revenue: number
  shopify_revenue: number
  highest_day?: number
  lowest_day?: number
  organic_clicks?: number
  total_orders?: number
}

export function validateSummaryData(data: any): SummaryData {
  if (!data || typeof data !== 'object') {
    return {
      total_revenue: 0,
      avg_daily_sales: 0,
      days_with_sales: 0,
      amazon_revenue: 0,
      woocommerce_revenue: 0,
      shopify_revenue: 0
    }
  }

  return {
    total_revenue: safeNumber(data.total_revenue),
    avg_daily_sales: safeNumber(data.avg_daily_sales),
    days_with_sales: safeNumber(data.days_with_sales),
    amazon_revenue: safeNumber(data.amazon_revenue),
    woocommerce_revenue: safeNumber(data.woocommerce_revenue),
    shopify_revenue: safeNumber(data.shopify_revenue),
    highest_day: data.highest_day !== undefined ? safeNumber(data.highest_day) : undefined,
    lowest_day: data.lowest_day !== undefined ? safeNumber(data.lowest_day) : undefined,
    organic_clicks: data.organic_clicks !== undefined ? safeNumber(data.organic_clicks) : undefined,
    total_orders: data.total_orders !== undefined ? safeNumber(data.total_orders) : undefined
  }
}

/**
 * Log validation errors in development
 */
export function logValidationErrors(componentName: string, errors: string[]) {
  if (process.env.NODE_ENV === 'development' && errors.length > 0) {
    console.error(`[${componentName}] Data validation errors:`, errors)
  }
}
