import { describe, expect, it } from "vitest"

import { filterCompletedTasks, filterInsightsByUser, getCompletionTrend, getContentFormatCounts } from "@/features/insights/insights-dashboard"
import type { WorkflowContentWorkItem, WorkflowTask } from "@/features/workflow/types"

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

  it("filters task and content insight data to the selected user", () => {
    const tasks = [
      { ...task("one", "todo", null), primaryOwner: { id: "user-1" } },
      { ...task("two", "todo", null), primaryOwner: { id: "user-2" } },
    ] as WorkflowTask[]
    const content = [
      { id: "content-1", assigneeId: "user-1" },
      { id: "content-2", assigneeId: "user-2" },
    ] as WorkflowContentWorkItem[]

    expect(filterInsightsByUser(tasks, content, "user-2")).toEqual({ tasks: [tasks[1]], content: [content[1]] })
    expect(filterInsightsByUser(tasks, content, "all")).toEqual({ tasks, content })
  })
})

describe("content format metrics", () => {
  it("counts recognized static and video formats while keeping unclear formats separate", () => {
    const content = [
      { id: "reel", format: "Reel" },
      { id: "video", format: "Short video" },
      { id: "static", format: "Static image" },
      { id: "carousel", format: "Carousel" },
      { id: "unknown", format: "Brand concept" },
    ] as WorkflowContentWorkItem[]

    expect(getContentFormatCounts(content)).toEqual({ total: 5, static: 2, video: 2, other: 1 })
  })
})
