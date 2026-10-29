"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

import { ContentCalendar, type ContentCalendarPost } from "@/features/calendar/content-calendar"
import { useWorkflow } from "@/features/workflow/workflow-provider"

export function CalendarWorkspace({ monthKey, contentPosts, contentError = false }: { monthKey: string; contentPosts?: ContentCalendarPost[]; contentError?: boolean }) {
  const router = useRouter()
  const [monthPending, startMonthTransition] = useTransition()
  const { workflowDataReady, workflowDataLoading, ensureWorkflowData, error } = useWorkflow()

  useEffect(() => {
    if (!workflowDataReady) void ensureWorkflowData()
  }, [workflowDataReady, ensureWorkflowData])

  return (
    <>
      {!workflowDataReady && (
        <div className="mx-auto max-w-[1480px] pt-4">
          {error && !workflowDataLoading ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs">
              <span>Task deadlines could not be loaded. You can still use the calendar.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void ensureWorkflowData()}><RefreshCw className="size-3.5" aria-hidden="true" />Retry task deadlines</Button>
            </div>
          ) : (
            <p role="status" aria-live="polite" className="rounded-lg border border-border/70 bg-card/55 px-3 py-2 text-xs text-muted-foreground">Loading task deadlines… You can still use the calendar below.</p>
          )}
        </div>
      )}
      <div className="relative" aria-busy={monthPending}>
        {monthPending && <p role="status" aria-live="polite" className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-full border border-primary/20 bg-background/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-md"><LoaderCircle className="size-3.5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />Loading calendar month…</p>}
        <div className={`transition-opacity duration-200 motion-reduce:transition-none ${monthPending ? "pointer-events-none opacity-60" : ""}`}>
          <ContentCalendar key={monthKey} monthKey={monthKey} onMonthChange={(nextMonth) => {
            if (nextMonth === monthKey) return
            startMonthTransition(() => router.push(`/calendar?month=${encodeURIComponent(nextMonth)}`, { scroll: false }))
          }} contentPosts={contentPosts} contentError={contentError} />
        </div>
      </div>
    </>
  )
}
