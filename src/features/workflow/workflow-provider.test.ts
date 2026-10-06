import { describe, expect, it } from "vitest"

import { initialWorkflowState } from "@/features/workflow/mock-data"
import { currentEmployee, currentSupervisor } from "@/features/workflow/task-permissions"
import { workflowReducer } from "@/features/workflow/workflow-provider"

describe("mocked submission workflow", () => {
  it("creates a new version without replacing prior review history", () => {
    const taskId = "upload-carousel-design-v2"
    const originalTask = initialWorkflowState.tasks.find((task) => task.id === taskId)
    const originalVersion = originalTask?.versions[0]

    const next = workflowReducer(initialWorkflowState, {
      type: "create_version",
      taskId,
      actor: currentEmployee,
      notes: "Applied supervisor feedback.",
      file: { id: "v2-file", name: "carousel-v2.pdf", size: 1000, type: "application/pdf" },
    })

    const updatedTask = next.tasks.find((task) => task.id === taskId)
    expect(updatedTask?.versions).toHaveLength(2)
    expect(updatedTask?.versions[0]).toEqual(originalVersion)
    expect(updatedTask?.versions[1]).toMatchObject({ number: 2, status: "draft" })
  })

  it("moves a submitted version through supervisor approval", () => {
    const taskId = "founder-story-reel"
    const approved = workflowReducer(initialWorkflowState, {
      type: "review_version",
      taskId,
      decision: "approved",
      comment: "Approved for publishing.",
      actor: currentSupervisor,
    })

    const task = approved.tasks.find((item) => item.id === taskId)
    expect(task?.status).toBe("approved")
    expect(task?.versions.at(-1)).toMatchObject({
      status: "approved",
      reviewComment: "Approved for publishing.",
      reviewedBy: "Sarah Chen",
    })
  })

  it("blocks an employee from approving a submitted version", () => {
    const attempted = workflowReducer(initialWorkflowState, {
      type: "review_version",
      taskId: "founder-story-reel",
      decision: "approved",
      comment: "Looks good.",
      actor: currentEmployee,
    })
    expect(attempted).toBe(initialWorkflowState)
  })

  it("does not let an employee complete, approve, or edit someone else's task", () => {
    const completed = workflowReducer(initialWorkflowState, {
      type: "update_status",
      taskId: "finalize-launch-day-captions",
      status: "completed",
      actor: currentEmployee,
    })
    const approved = workflowReducer(initialWorkflowState, {
      type: "update_status",
      taskId: "finalize-launch-day-captions",
      status: "approved",
      actor: currentEmployee,
    })
    const someoneElses = workflowReducer(initialWorkflowState, {
      type: "update_status",
      taskId: "founder-story-reel",
      status: "in_progress",
      actor: currentEmployee,
    })
    const skippedReview = workflowReducer(initialWorkflowState, {
      type: "update_status",
      taskId: "finalize-launch-day-captions",
      status: "for_review",
      actor: currentEmployee,
    })

    expect(completed).toBe(initialWorkflowState)
    expect(approved).toBe(initialWorkflowState)
    expect(someoneElses).toBe(initialWorkflowState)
    expect(skippedReview).toBe(initialWorkflowState)
  })
})
