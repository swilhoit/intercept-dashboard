"use client"

import { Button } from "@/components/ui/button"
import { 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  startOfQuarter, 
  endOfQuarter, 
  startOfYear, 
  endOfYear,
  subMonths,
  startOfWeek,
  endOfWeek
} from "date-fns"
import { DateRange } from "react-day-picker"

interface DateRangePresetsProps {
  onSelectPreset: (range: DateRange) => void
  currentRange?: DateRange
}

export function DateRangePresets({ onSelectPreset, currentRange }: DateRangePresetsProps) {
  const presets = [
    {
      label: "Today",
      getValue: () => ({
        from: new Date(),
        to: new Date()
      })
    },
    {
      label: "Yesterday",
      getValue: () => ({
        from: subDays(new Date(), 1),
        to: subDays(new Date(), 1)
      })
    },
    {
      label: "Last 7 Days",
      getValue: () => ({
        from: subDays(new Date(), 6),
        to: new Date()
      })
    },
    {
      label: "Last 14 Days",
      getValue: () => ({
        from: subDays(new Date(), 13),
        to: new Date()
      })
    },
    {
      label: "Last 30 Days",
      getValue: () => ({
        from: subDays(new Date(), 29),
        to: new Date()
      })
    },
    {
      label: "Last 90 Days",
      getValue: () => ({
        from: subDays(new Date(), 89),
        to: new Date()
      })
    },
    {
      label: "This Week",
      getValue: () => ({
        from: startOfWeek(new Date(), { weekStartsOn: 0 }),
        to: endOfWeek(new Date(), { weekStartsOn: 0 })
      })
    },
    {
      label: "Last Week",
      getValue: () => {
        const lastWeek = subDays(new Date(), 7)
        return {
          from: startOfWeek(lastWeek, { weekStartsOn: 0 }),
          to: endOfWeek(lastWeek, { weekStartsOn: 0 })
        }
      }
    },
    {
      label: "This Month",
      getValue: () => ({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
      })
    },
    {
      label: "Last Month",
      getValue: () => {
        const lastMonth = subMonths(new Date(), 1)
        return {
          from: startOfMonth(lastMonth),
          to: endOfMonth(lastMonth)
        }
      }
    },
    {
      label: "This Quarter",
      getValue: () => ({
        from: startOfQuarter(new Date()),
        to: endOfQuarter(new Date())
      })
    },
    {
      label: "Last Quarter",
      getValue: () => {
        const lastQuarter = subMonths(new Date(), 3)
        return {
          from: startOfQuarter(lastQuarter),
          to: endOfQuarter(lastQuarter)
        }
      }
    },
    {
      label: "This Year",
      getValue: () => ({
        from: startOfYear(new Date()),
        to: endOfYear(new Date())
      })
    },
    {
      label: "Last Year",
      getValue: () => {
        const lastYear = new Date()
        lastYear.setFullYear(lastYear.getFullYear() - 1)
        return {
          from: startOfYear(lastYear),
          to: endOfYear(lastYear)
        }
      }
    }
  ]

  const isActivePreset = (preset: typeof presets[0]) => {
    if (!currentRange?.from || !currentRange?.to) return false
    const presetRange = preset.getValue()
    return (
      currentRange.from.toDateString() === presetRange.from.toDateString() &&
      currentRange.to.toDateString() === presetRange.to.toDateString()
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => (
        <Button
          key={preset.label}
          variant={isActivePreset(preset) ? "default" : "outline"}
          size="sm"
          onClick={() => onSelectPreset(preset.getValue())}
          className="text-xs"
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}