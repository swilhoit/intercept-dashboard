"use client"

import { SearchConsoleAnalytics } from "@/components/dashboard/search-console-analytics"
import { useState, Suspense } from "react"
import { DateRange } from "react-day-picker"
import { subDays } from "date-fns"
import { useSearchParams } from "next/navigation"

function SearchConsoleContent() {
  const searchParams = useSearchParams()
  
  const getDateRange = (): DateRange | undefined => {
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    if (startDate && endDate) {
      return {
        from: new Date(startDate),
        to: new Date(endDate),
      }
    }
    
    return {
      from: subDays(new Date(), 7),
      to: new Date(),
    }
  }

  const [dateRange] = useState<DateRange | undefined>(getDateRange())

  return <SearchConsoleAnalytics dateRange={dateRange} />
}

export default function SearchConsolePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">Loading...</div>}>
      <SearchConsoleContent />
    </Suspense>
  )
}