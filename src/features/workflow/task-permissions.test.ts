import { describe, expect, it } from "vitest"

import { initialWorkflowState } from "@/features/workflow/mock-data"
import { currentEmployee, currentSupervisor, isSupervisorOwnedTask, taskStatusOptions } from "@/features/workflow/task-permissions"

describe("task review permissions", () => {
  const employeeTask = initialWorkflowState.tasks.find((task) => task.status === "todo")!

  it("lets supervisors complete their own tasks without approval", () => {
    const ownTask = { ...employeeTask, primaryOwner: { ...employeeTask.primaryOwner, id: currentSupervisor.id } }

    expect(isSupervisorOwnedTask(ownTask, currentSupervisor)).toBe(true)
    expect(taskStatusOptions(ownTask, currentSupervisor)).toContain("completed")
  })

  it("keeps supervisor review required for employee-owned tasks", () => {
    expect(isSupervisorOwnedTask(employeeTask, currentSupervisor)).toBe(false)
    expect(taskStatusOptions(employeeTask, currentSupervisor)).not.toContain("completed")
  })

  it("does not let employees bypass review by completing a task", () => {
    expect(taskStatusOptions(employeeTask, currentEmployee)).not.toContain("completed")
  })
})
