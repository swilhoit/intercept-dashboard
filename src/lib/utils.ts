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