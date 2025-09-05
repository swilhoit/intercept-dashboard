"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { DateRange } from "react-day-picker"
import { subDays } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"

interface DashboardContextType {
  dateRange: DateRange | undefined
  selectedChannel: string
  setDateRange: (dateRange: DateRange | undefined) => void
  setSelectedChannel: (channel: string) => void
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  })
  const [selectedChannel, setSelectedChannelState] = useState<string>("all")
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize from URL parameters
  useEffect(() => {
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const channel = searchParams.get('channel')

    if (startDate && endDate) {
      setDateRangeState({
        from: new Date(startDate),
        to: new Date(endDate),
      })
    }

    if (channel) {
      setSelectedChannelState(channel)
    }
  }, [searchParams])

  const setDateRange = (newDateRange: DateRange | undefined) => {
    setDateRangeState(newDateRange)
    updateURL(newDateRange, selectedChannel)
  }

  const setSelectedChannel = (newChannel: string) => {
    setSelectedChannelState(newChannel)
    updateURL(dateRange, newChannel)
  }

  const updateURL = (dateRange: DateRange | undefined, channel: string) => {
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append('startDate', dateRange.from.toISOString().split('T')[0])
    }
    if (dateRange?.to) {
      params.append('endDate', dateRange.to.toISOString().split('T')[0])
    }
    if (channel !== 'all') {
      params.append('channel', channel)
    }

    const url = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
    router.replace(url)
  }

  return (
    <DashboardContext.Provider 
      value={{ 
        dateRange, 
        selectedChannel, 
        setDateRange, 
        setSelectedChannel 
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider')
  }
  return context
}