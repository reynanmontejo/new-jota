import { describe, expect, it } from "vitest"
import { getTaskDueTimestamp, isTaskDueOnDate, taskDueLabel } from "@/features/workflow/task-dates"

describe("task due dates", () => {
  const today = new Date(2026, 9, 4, 12)

  it("uses canonical database timestamps instead of localized display text", () => {
    const task = { dueAt: new Date(2026, 9, 4, 9).toISOString(), dueDate: "Oct 4, 2026 at 9:00 AM" }
    expect(isTaskDueOnDate(task, today)).toBe(true)
    expect(taskDueLabel(task, today)).toMatch(/9:00/)
  })

  it("still handles legacy demo dates and sorts invalid dates last", () => {
    const task = { dueDate: "Sep 25, 2026 · 10:30 AM" }
    expect(getTaskDueTimestamp(task)).toBe(new Date("Sep 25, 2026 10:30 AM").getTime())
    expect(isTaskDueOnDate(task, today)).toBe(false)
    expect(getTaskDueTimestamp({ dueDate: "Not set" })).toBe(Number.POSITIVE_INFINITY)
  })
})
