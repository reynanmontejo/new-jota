import { describe, expect, it } from "vitest"

import { filterCompletedTasks, getCompletionTrend } from "@/features/insights/insights-dashboard"
import type { WorkflowTask } from "@/features/workflow/types"

function task(id: string, status: WorkflowTask["status"], completedAt: string | null): WorkflowTask {
  return { id, status, completedAt } as WorkflowTask
}

describe("insights completion metrics", () => {
  const now = new Date(2026, 9, 13, 12)

  it("filters completed tasks by reliable completion dates and leaves undated tasks in All dates", () => {
    const tasks = [
      task("recent", "completed", "2026-10-10T12:00:00.000Z"),
      task("older", "completed", "2026-08-01T12:00:00.000Z"),
      task("undated", "completed", null),
      task("not-completed", "in_progress", "2026-10-11T12:00:00.000Z"),
    ]

    expect(filterCompletedTasks(tasks, "30", now).map(({ id }) => id)).toEqual(["recent"])
    expect(filterCompletedTasks(tasks, "all", now).map(({ id }) => id)).toEqual(["recent", "older", "undated"])
  })

  it("counts dated completions in six non-overlapping weeks", () => {
    const trend = getCompletionTrend([
      task("this-week", "completed", "2026-10-13T08:00:00.000Z"),
      task("last-week", "completed", "2026-10-06T08:00:00.000Z"),
      task("in-progress", "in_progress", "2026-10-13T08:00:00.000Z"),
      task("missing-date", "completed", null),
    ], now)

    expect(trend).toHaveLength(6)
    expect(trend.at(-1)?.count).toBe(1)
    expect(trend.at(-2)?.count).toBe(1)
    expect(trend.reduce((total, week) => total + week.count, 0)).toBe(2)
  })

  it("groups completed tasks into daily and monthly buckets", () => {
    const tasks = [
      task("today", "completed", "2026-10-13T08:00:00.000Z"),
      task("september", "completed", "2026-09-20T08:00:00.000Z"),
    ]
    const daily = getCompletionTrend(tasks, now, "daily")
    const monthly = getCompletionTrend(tasks, now, "monthly")

    expect(daily).toHaveLength(7)
    expect(daily.reduce((total, period) => total + period.count, 0)).toBe(1)
    expect(monthly).toHaveLength(6)
    expect(monthly.slice(-2).map((period) => period.count)).toEqual([1, 1])
  })
})
