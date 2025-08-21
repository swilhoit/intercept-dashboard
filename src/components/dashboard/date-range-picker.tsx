"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, startOfWeek, endOfWeek } from "date-fns"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface DateRangePickerProps {
  date: DateRange | undefined
  onDateChange: (date: DateRange | undefined) => void
}

export function DateRangePicker({ date, onDateChange }: DateRangePickerProps) {
  const presets = [
    {
      label: "Today",
      getValue: () => ({
        from: new Date(),
        to: new Date()
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
      label: "This Year",
      getValue: () => ({
        from: startOfYear(new Date()),
        to: new Date()
      })
    }
  ]

  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Tabs defaultValue="presets" className="w-[650px]">
            <TabsList className="w-full">
              <TabsTrigger value="presets" className="flex-1">Presets</TabsTrigger>
              <TabsTrigger value="calendar" className="flex-1">Calendar</TabsTrigger>
            </TabsList>
            <TabsContent value="presets" className="p-4">
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onDateChange(preset.getValue())
                      // Close the popover by clicking the trigger
                      document.getElementById('date')?.click()
                    }}
                    className="justify-start"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="calendar" className="p-0">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={onDateChange}
                numberOfMonths={2}
              />
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  )
}