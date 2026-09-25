"use client"

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react"

import { initialWorkflowState } from "@/features/workflow/mock-data"
import type { TaskStatus, WorkflowFile, WorkflowState } from "@/features/workflow/types"

type ReviewDecision = "approved" | "revision_requested"

export type NewTaskInput = {
  title: string
  clientId: string
  clientName: string
  campaign: string
  priority: "low" | "medium" | "high" | "urgent"
  dueDate: string
}

type WorkflowAction =
  | { type: "toggle_checklist"; taskId: string; itemId: string }
  | { type: "add_comment"; taskId: string; body: string }
  | { type: "update_status"; taskId: string; status: TaskStatus }
  | { type: "create_version"; taskId: string; file: WorkflowFile; notes: string }
  | { type: "submit_version"; taskId: string }
  | { type: "review_version"; taskId: string; decision: ReviewDecision; comment: string }
  | { type: "create_task"; task: WorkflowState["tasks"][number] }

export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  if (action.type === "create_task") return { tasks: [action.task, ...state.tasks] }

  return {
    tasks: state.tasks.map((task) => {
      if (task.id !== action.taskId) return task

      if (action.type === "toggle_checklist") {
        return {
          ...task,
          checklist: task.checklist.map((item) => item.id === action.itemId ? { ...item, completed: !item.completed } : item),
        }
      }

      if (action.type === "add_comment") {
        return {
          ...task,
          comments: [...task.comments, { id: crypto.randomUUID(), author: "Maria Reyes", initials: "MR", body: action.body, createdAt: "Just now" }],
          activity: [{ id: crypto.randomUUID(), label: "Comment added", actor: "Maria Reyes", createdAt: "Just now" }, ...task.activity],
        }
      }

      if (action.type === "update_status") return { ...task, status: action.status }

      if (action.type === "create_version") {
        const nextNumber = Math.max(0, ...task.versions.map((version) => version.number)) + 1
        return {
          ...task,
          versions: [
            ...task.versions,
            {
              id: crypto.randomUUID(),
              number: nextNumber,
              status: "draft",
              notes: action.notes,
              submittedBy: "Maria Reyes",
              submittedById: "maria",
              submittedAt: null,
              files: [action.file],
            },
          ],
          activity: [{ id: crypto.randomUUID(), label: `V${nextNumber} uploaded as a draft`, actor: "Maria Reyes", createdAt: "Just now" }, ...task.activity],
        }
      }

      if (action.type === "submit_version") {
        const latestNumber = Math.max(0, ...task.versions.map((version) => version.number))
        return {
          ...task,
          status: "for_review",
          versions: task.versions.map((version) => version.number === latestNumber ? { ...version, status: "submitted", submittedAt: "Just now" } : version),
          activity: [{ id: crypto.randomUUID(), label: `V${latestNumber} submitted for review`, actor: "Maria Reyes", createdAt: "Just now" }, ...task.activity],
        }
      }

      const latestNumber = Math.max(0, ...task.versions.map((version) => version.number))
      const approved = action.decision === "approved"
      return {
        ...task,
        status: approved ? "approved" : "revision_requested",
        versions: task.versions.map((version) => version.number === latestNumber ? {
          ...version,
          status: action.decision,
          reviewComment: action.comment,
          reviewedBy: "Sarah Chen",
          reviewedAt: "Just now",
        } : version),
        activity: [{ id: crypto.randomUUID(), label: approved ? `V${latestNumber} approved` : `Revision requested on V${latestNumber}`, actor: "Sarah Chen", createdAt: "Just now" }, ...task.activity],
      }
    }),
  }
}

type WorkflowContextValue = {
  tasks: WorkflowState["tasks"]
  toggleChecklist: (taskId: string, itemId: string) => void
  addComment: (taskId: string, body: string) => void
  updateStatus: (taskId: string, status: TaskStatus) => void
  createVersion: (taskId: string, file: WorkflowFile, notes: string) => void
  submitLatestVersion: (taskId: string) => void
  reviewLatestVersion: (taskId: string, decision: ReviewDecision, comment: string) => void
  createTask: (input: NewTaskInput) => string
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null)

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, initialWorkflowState)

  const value = useMemo<WorkflowContextValue>(() => ({
    tasks: state.tasks,
    toggleChecklist: (taskId, itemId) => dispatch({ type: "toggle_checklist", taskId, itemId }),
    addComment: (taskId, body) => dispatch({ type: "add_comment", taskId, body }),
    updateStatus: (taskId, status) => dispatch({ type: "update_status", taskId, status }),
    createVersion: (taskId, file, notes) => dispatch({ type: "create_version", taskId, file, notes }),
    submitLatestVersion: (taskId) => dispatch({ type: "submit_version", taskId }),
    reviewLatestVersion: (taskId, decision, comment) => dispatch({ type: "review_version", taskId, decision, comment }),
    createTask: (input) => {
      const id = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${crypto.randomUUID().slice(0, 6)}`
      dispatch({
        type: "create_task",
        task: {
          id,
          title: input.title,
          description: "New task created from the global task form.",
          clientId: input.clientId,
          clientName: input.clientName,
          campaign: input.campaign,
          contentItem: "General campaign work",
          priority: input.priority,
          status: "todo",
          startDate: "Today",
          dueDate: input.dueDate,
          primaryOwner: { id: "maria", name: "Maria Reyes", initials: "MR", role: "Account Manager" },
          collaborators: [],
          checklist: [],
          comments: [],
          versions: [],
          activity: [{ id: crypto.randomUUID(), label: "Task created", actor: "Maria Reyes", createdAt: "Just now" }],
        },
      })
      return id
    },
  }), [state.tasks])

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflow() {
  const context = useContext(WorkflowContext)
  if (!context) throw new Error("useWorkflow must be used within WorkflowProvider")
  return context
}
