"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"

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
              <button type="button" onClick={() => void ensureWorkflowData()} className="font-semibold text-primary underline underline-offset-2">Retry task deadlines</button>
            </div>
          ) : (
            <p role="status" aria-live="polite" className="rounded-lg border border-border/70 bg-card/55 px-3 py-2 text-xs text-muted-foreground">Loading task deadlines… You can still use the calendar below.</p>
          )}
        </div>
      )}
      {monthPending && <p role="status" aria-live="polite" className="mx-auto max-w-[1480px] pt-2 text-xs text-muted-foreground">Loading calendar month…</p>}
      <ContentCalendar key={monthKey} monthKey={monthKey} onMonthChange={(nextMonth) => {
        if (nextMonth === monthKey) return
        startMonthTransition(() => router.push(`/calendar?month=${encodeURIComponent(nextMonth)}`, { scroll: false }))
      }} contentPosts={contentPosts} contentError={contentError} />
    </>
  )
}
