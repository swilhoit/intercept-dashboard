"use client"

import { CombinedAdvertisingDashboard } from "@/components/dashboard/combined-advertising-dashboard"
import { useState, Suspense } from "react"
import { DateRange } from "react-day-picker"
import { subDays } from "date-fns"
import { useSearchParams } from "next/navigation"

function AdvertisingContent() {
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

  return <CombinedAdvertisingDashboard dateRange={dateRange} />
}

export default function AdvertisingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">Loading...</div>}>
      <AdvertisingContent />
    </Suspense>
  )
}