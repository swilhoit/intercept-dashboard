import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date utility functions for period comparisons
export function calculatePreviousPeriod(startDate: string, endDate: string): { startDate: string, endDate: string } {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  // Calculate the number of days in the current period
  const periodLength = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  
  // Calculate previous period by going back the same number of days
  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1) // Day before current period starts
  
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - periodLength + 1)
  
  return {
    startDate: prevStart.toISOString().split('T')[0],
    endDate: prevEnd.toISOString().split('T')[0]
  }
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0
  }
  return ((current - previous) / previous) * 100
}

export function formatPercentageChange(change: number): string {
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}

/**
 * Format a number as currency with consistent formatting
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string
 */
export function formatCurrency(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0)
}

/**
 * Format a number with comma separators
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0)
}

/**
 * Format a percentage with proper handling of NaN and Infinity
 * @param value - The percentage value (0-100)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string or fallback
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  if (isNaN(value) || !isFinite(value)) {
    return '0%'
  }
  return `${value.toFixed(decimals)}%`
}

/**
 * Safely calculate a percentage avoiding NaN
 * @param numerator - The numerator value
 * @param denominator - The denominator value
 * @returns Percentage value (0-100) or 0 if invalid
 */
export function safePercentage(numerator: number, denominator: number): number {
  if (!denominator || denominator === 0 || isNaN(numerator) || isNaN(denominator)) {
    return 0
  }
  const result = (numerator / denominator) * 100
  return isFinite(result) ? result : 0
}