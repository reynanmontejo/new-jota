import { describe, expect, it } from "vitest"

import { initialWorkflowState } from "@/features/workflow/mock-data"
import { workflowReducer } from "@/features/workflow/workflow-provider"

describe("mocked submission workflow", () => {
  it("creates a new version without replacing prior review history", () => {
    const taskId = "upload-carousel-design-v2"
    const originalTask = initialWorkflowState.tasks.find((task) => task.id === taskId)
    const originalVersion = originalTask?.versions[0]

    const next = workflowReducer(initialWorkflowState, {
      type: "create_version",
      taskId,
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
    })

    const task = approved.tasks.find((item) => item.id === taskId)
    expect(task?.status).toBe("approved")
    expect(task?.versions.at(-1)).toMatchObject({
      status: "approved",
      reviewComment: "Approved for publishing.",
      reviewedBy: "Sarah Chen",
    })
  })
})
