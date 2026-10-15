import { describe, expect, it } from "vitest"

import { countOpenSidebarTasks } from "@/features/workflow/sidebar-counts"

const tasks = [
  { id: "owned", status: "todo", created_by: "creator" },
  { id: "collaborator", status: "in_progress", created_by: "creator" },
  { id: "created", status: "for_review", created_by: "employee" },
  { id: "completed", status: "completed", created_by: "employee" },
]
const assignments = [
  { task_id: "owned", user_id: "employee", is_primary: true },
  { task_id: "owned", user_id: "collaborator-user", is_primary: false },
  { task_id: "collaborator", user_id: "someone-else", is_primary: true },
  { task_id: "collaborator", user_id: "employee", is_primary: false },
]

describe("sidebar task count", () => {
  it("counts only open tasks owned by the employee, with creator fallback", () => {
    expect(countOpenSidebarTasks(tasks, assignments, { id: "employee", role: "employee" })).toBe(2)
  })

  it("counts all accessible open tasks for a supervisor", () => {
    expect(countOpenSidebarTasks(tasks, assignments, { id: "supervisor", role: "supervisor" })).toBe(3)
  })
})
