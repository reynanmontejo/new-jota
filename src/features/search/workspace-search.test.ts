import { describe, expect, it } from "vitest"

import type { WorkflowClient, WorkflowTask } from "@/features/workflow/types"
import { searchWorkspace } from "@/features/search/workspace-search"

const task = {
  id: "task-1",
  title: "Prepare launch report",
  description: "",
  clientId: "client-1",
  clientName: "Northwind Coffee",
  campaign: "Autumn Launch",
} as WorkflowTask

const clients: WorkflowClient[] = [{
  id: "client-1",
  name: "Northwind Coffee",
  campaigns: [{ id: "campaign-1", name: "Autumn Launch" }],
}]

describe("workspace search", () => {
  it("finds tasks, clients, and campaigns by title or related name", () => {
    expect(searchWorkspace("launch", [task], clients).map(({ type }) => type)).toEqual(["Task", "Campaign"])
    expect(searchWorkspace("northwind", [task], clients).map(({ type }) => type)).toEqual(["Task", "Client", "Campaign"])
  })

  it("ignores surrounding whitespace and returns no results for a blank query", () => {
    expect(searchWorkspace("  coffee ", [task], clients)[0]?.type).toBe("Task")
    expect(searchWorkspace("   ", [task], clients)).toEqual([])
  })
})
