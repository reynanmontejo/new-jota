"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { addTaskCommentAction, createTaskAction, toggleTaskChecklistAction, updateTaskStatusAction } from "@/app/tasks/actions"
import { initialWorkflowState } from "@/features/workflow/mock-data"
import { canCreateTask, canEditTask, currentEmployee, currentSupervisor, taskStatusOptions, type DemoUser } from "@/features/workflow/task-permissions"
import type { TaskStatus, WorkflowAssignableUser, WorkflowClient, WorkflowContentWorkItem, WorkflowFile, WorkflowState, WorkflowTaskDetails, WorkflowUpcomingContent } from "@/features/workflow/types"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"

type ReviewDecision = "approved" | "revision_requested"

type NewTaskInputFields = {
  title: string
  clientId: string | null
  clientName: string
  campaign: string
  priority: "low" | "medium" | "high" | "urgent"
  assigneeId: string
  contentItemId?: string | null
  contentItemTitle?: string
}
export type NewTaskInput = NewTaskInputFields & ({ dueAt: string; dueDate?: string } | { dueDate: string; dueAt?: string })

function formatTaskDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date)
}

type WorkflowAction =
  | { type: "replace_tasks"; tasks: WorkflowState["tasks"] }
  | { type: "hydrate_task_details"; taskId: string; details: WorkflowTaskDetails }
  | { type: "toggle_checklist"; taskId: string; itemId: string; actor: DemoUser }
  | { type: "add_comment"; taskId: string; body: string; actor: DemoUser }
  | { type: "update_status"; taskId: string; status: TaskStatus; actor: DemoUser }
  | { type: "create_version"; taskId: string; file: WorkflowFile; notes: string; actor: DemoUser }
  | { type: "submit_version"; taskId: string; actor: DemoUser }
  | { type: "review_version"; taskId: string; decision: ReviewDecision; comment: string; actor: DemoUser }
  | { type: "create_task"; task: WorkflowState["tasks"][number]; actor: DemoUser }

export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  if (action.type === "replace_tasks") return { tasks: action.tasks }
  if (action.type === "hydrate_task_details") {
    let changed = false
    const tasks = state.tasks.map((task) => {
      if (task.id !== action.taskId || task.detailsLoaded) return task
      changed = true
      return { ...task, ...action.details, detailsLoaded: true }
    })
    return changed ? { tasks } : state
  }
  if (action.type === "create_task") {
    if (!canCreateTask(action.actor)) return state
    return { tasks: [action.task, ...state.tasks] }
  }

  const tasks: WorkflowState["tasks"] = state.tasks.map((task): WorkflowState["tasks"][number] => {
      if (task.id !== action.taskId) return task

      if (action.type === "review_version") {
        if (action.actor.role !== "supervisor" || task.status !== "for_review") return task
      } else if (action.type === "update_status") {
        if (!taskStatusOptions(task, action.actor).includes(action.status)) return task
      } else if (!canEditTask(task, action.actor.id)) {
        return task
      }

      if (action.type === "toggle_checklist") {
        return {
          ...task,
          checklist: task.checklist.map((item) => item.id === action.itemId ? { ...item, completed: !item.completed } : item),
        }
      }

      if (action.type === "add_comment") {
        return {
          ...task,
          comments: [...task.comments, { id: crypto.randomUUID(), author: action.actor.name, initials: action.actor.name.split(" ").map((part) => part[0]).join(""), body: action.body, createdAt: "Just now" }],
          activity: [{ id: crypto.randomUUID(), label: "Comment added", actor: action.actor.name, createdAt: "Just now" }, ...task.activity],
        }
      }

      if (action.type === "update_status") {
        return {
          ...task,
          status: action.status,
          activity: [{ id: crypto.randomUUID(), label: `Status changed to ${action.status.replaceAll("_", " ")}`, actor: action.actor.name, createdAt: "Just now" }, ...task.activity],
        }
      }

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
              submittedBy: action.actor.name,
              submittedById: action.actor.id,
              submittedAt: null,
              files: [action.file],
            },
          ],
          activity: [{ id: crypto.randomUUID(), label: `V${nextNumber} uploaded as a draft`, actor: action.actor.name, createdAt: "Just now" }, ...task.activity],
        }
      }

      if (action.type === "submit_version") {
        const latestNumber = Math.max(0, ...task.versions.map((version) => version.number))
        const latestVersion = task.versions.at(-1)
        if (!latestVersion || latestVersion.status !== "draft" || latestVersion.files.length === 0) return task
        return {
          ...task,
          status: "for_review",
          versions: task.versions.map((version) => version.number === latestNumber ? { ...version, status: "submitted", submittedAt: "Just now" } : version),
          activity: [{ id: crypto.randomUUID(), label: `V${latestNumber} submitted for review`, actor: action.actor.name, createdAt: "Just now" }, ...task.activity],
        }
      }

      const latestNumber = Math.max(0, ...task.versions.map((version) => version.number))
      const latestVersion = task.versions.at(-1)
      if (action.actor.role !== "supervisor" || latestVersion?.status !== "submitted" || latestVersion.submittedById === action.actor.id) return task
      const approved = action.decision === "approved"
      return {
        ...task,
        status: approved ? "approved" : "revision_requested",
        versions: task.versions.map((version) => version.number === latestNumber ? {
          ...version,
          status: action.decision,
          reviewComment: action.comment,
          reviewedBy: action.actor.name,
          reviewedAt: "Just now",
        } : version),
        activity: [{ id: crypto.randomUUID(), label: approved ? `V${latestNumber} approved` : `Revision requested on V${latestNumber}`, actor: action.actor.name, createdAt: "Just now" }, ...task.activity],
      }
    })
  return tasks.every((task, index) => task === state.tasks[index]) ? state : { tasks }
}

type WorkflowContextValue = {
  tasks: WorkflowState["tasks"]
  clients: WorkflowClient[]
  assignableUsers: WorkflowAssignableUser[]
  upcomingContent: WorkflowUpcomingContent[]
  contentWorkItems: WorkflowContentWorkItem[]
  currentUser: DemoUser
  demoMode: boolean
  realtimeRevision: number
  error: string | null
  clearError: () => void
  switchDemoUser: (role: DemoUser["role"]) => void
  toggleChecklist: (taskId: string, itemId: string) => void
  addComment: (taskId: string, body: string) => Promise<boolean>
  updateStatus: (taskId: string, status: TaskStatus) => void
  createVersion: (taskId: string, file: WorkflowFile, notes: string) => void
  submitLatestVersion: (taskId: string) => void
  reviewLatestVersion: (taskId: string, decision: ReviewDecision, comment: string) => void
  createTask: (input: NewTaskInput) => Promise<string | null>
  loadTaskDetails: (taskId: string) => Promise<boolean>
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null)
const demoRoleKey = "jota-demo-role"
const legacyDemoRoleKey = "northstar-demo-role"
const demoRoleEvent = "jota-demo-role-changed"
const legacyDemoRoleEvent = "northstar-demo-role-changed"

function subscribeDemoRole(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(demoRoleEvent, callback)
  window.addEventListener(legacyDemoRoleEvent, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(demoRoleEvent, callback)
    window.removeEventListener(legacyDemoRoleEvent, callback)
  }
}

function getDemoRole(): DemoUser["role"] {
  try { return (window.sessionStorage.getItem(demoRoleKey) ?? window.sessionStorage.getItem(legacyDemoRoleKey)) === "supervisor" ? "supervisor" : "employee" } catch { return "employee" }
}

function getServerDemoRole(): DemoUser["role"] { return "employee" }

export function WorkflowProvider({
  children,
  initialUser,
  initialTasks,
  initialClients,
  initialAssignableUsers,
  initialUpcomingContent,
  initialContentWorkItems,
  demoMode = true,
}: {
  children: ReactNode
  initialUser?: DemoUser | null
  initialTasks?: WorkflowState["tasks"]
  initialClients?: WorkflowClient[]
  initialAssignableUsers?: WorkflowAssignableUser[]
  initialUpcomingContent?: WorkflowUpcomingContent[]
  initialContentWorkItems?: WorkflowContentWorkItem[]
  demoMode?: boolean
}) {
  const [state, dispatch] = useReducer(workflowReducer, { tasks: initialTasks ?? initialWorkflowState.tasks })
  const [error, setError] = useState<string | null>(null)
  const [realtimeRevision, setRealtimeRevision] = useState(0)
  const taskDetailsRequests = useRef(new Map<string, Promise<boolean>>())
  const router = useRouter()

  useEffect(() => {
    if (demoMode || !initialUser?.id || !isSupabaseConfigured()) return

    const supabase = createSupabaseClient()
    const trackedTables = [
      "tasks",
      "task_assignees",
      "task_checklist_items",
      "comments",
      "activity_logs",
      "submissions",
      "submission_versions",
      "submission_version_files",
      "reviews",
      "content_items",
      "content_submissions",
      "content_submission_versions",
      "content_reviews",
    ] as const
    let refreshTimer: number | undefined
    let reconnectTimer: number | undefined
    let channel: ReturnType<typeof supabase.channel> | null = null
    let retryAttempt = 0
    let isSubscribed = false
    let hasSubscribed = false
    let disposed = false
    const refreshWorkflow = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        setRealtimeRevision((revision) => revision + 1)
        router.refresh()
      }, 200)
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return
      const delay = Math.min(1000 * 2 ** retryAttempt, 30_000)
      retryAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined
        connect()
      }, delay)
    }

    const connect = () => {
      if (disposed || channel) return
      const nextChannel = supabase.channel(`task-workflow:${initialUser.id}`)
      channel = nextChannel
      for (const table of trackedTables) {
        nextChannel.on("postgres_changes", { event: "*", schema: "public", table }, refreshWorkflow)
      }
      nextChannel.subscribe((status) => {
        if (disposed || channel !== nextChannel) return
        if (status === "SUBSCRIBED") {
          const isReconnect = hasSubscribed
          hasSubscribed = true
          isSubscribed = true
          retryAttempt = 0
          if (isReconnect) refreshWorkflow()
          return
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          isSubscribed = false
          channel = null
          void supabase.removeChannel(nextChannel)
          scheduleReconnect()
        }
      })
    }

    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") {
        refreshWorkflow()
        if (!isSubscribed && !channel) scheduleReconnect()
      }
    }

    connect()
    const fallbackTimer = window.setInterval(() => {
      if (!isSubscribed && document.visibilityState === "visible") refreshWorkflow()
    }, 30_000)
    document.addEventListener("visibilitychange", refreshOnReturn)

    return () => {
      disposed = true
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (fallbackTimer !== undefined) window.clearInterval(fallbackTimer)
      document.removeEventListener("visibilitychange", refreshOnReturn)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [demoMode, initialUser?.id, router])

  useEffect(() => {
    if (!demoMode && initialTasks) dispatch({ type: "replace_tasks", tasks: initialTasks })
  }, [demoMode, initialTasks])
  const demoRole = useSyncExternalStore(subscribeDemoRole, getDemoRole, getServerDemoRole)
  const currentUser = demoMode
    ? demoRole === "supervisor" ? currentSupervisor : currentEmployee
    : initialUser ?? currentEmployee
  const clients = useMemo<WorkflowClient[]>(() => initialClients ?? Array.from(new Map(state.tasks.map((task) => [task.clientId, task.clientName])).entries()).map(([id, name]) => ({ id, name, campaigns: Array.from(new Set(state.tasks.filter((task) => task.clientId === id).map((task) => task.campaign))).map((campaignName) => ({ id: campaignName, name: campaignName })) })), [initialClients, state.tasks])
  const assignableUsers = useMemo(() => initialAssignableUsers ?? [], [initialAssignableUsers])
  const loadTaskDetails = useCallback((taskId: string) => {
    const cached = taskDetailsRequests.current.get(taskId)
    if (cached) return cached

    const request = (async () => {
      try {
        const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/details`, { cache: "no-store" })
        const payload = await response.json() as { details?: WorkflowTaskDetails; error?: string }
        if (!response.ok || !payload.details) throw new Error(payload.error ?? "Could not load task details.")
        dispatch({ type: "hydrate_task_details", taskId, details: payload.details })
        return true
      } catch {
        return false
      } finally {
        taskDetailsRequests.current.delete(taskId)
      }
    })()

    taskDetailsRequests.current.set(taskId, request)
    return request
  }, [])

  const value = useMemo<WorkflowContextValue>(() => ({
    tasks: state.tasks,
    clients,
    assignableUsers,
    upcomingContent: initialUpcomingContent ?? [],
    contentWorkItems: initialContentWorkItems ?? [],
    currentUser,
    demoMode,
    realtimeRevision,
    error,
    clearError: () => setError(null),
    switchDemoUser: (role) => {
      if (!demoMode) return
      try {
        window.sessionStorage.setItem(demoRoleKey, role)
        window.dispatchEvent(new Event(demoRoleEvent))
      } catch { /* Keep the current demo role if browser storage is unavailable. */ }
    },
    toggleChecklist: async (taskId, itemId) => {
      if (!demoMode) {
        const result = await toggleTaskChecklistAction(taskId, itemId)
        if (result.error || result.completed === null) return setError(result.error ?? "Checklist update failed.")
      }
      dispatch({ type: "toggle_checklist", taskId, itemId, actor: currentUser })
    },
    addComment: async (taskId, body) => {
      if (!demoMode) {
        const result = await addTaskCommentAction(taskId, body)
        if (result.error) {
          setError(result.error)
          return false
        }
      }
      dispatch({ type: "add_comment", taskId, body, actor: currentUser })
      return true
    },
    updateStatus: async (taskId, status) => {
      if (!demoMode) {
        const result = await updateTaskStatusAction(taskId, status)
        if (result.error) return setError(result.error)
      }
      dispatch({ type: "update_status", taskId, status, actor: currentUser })
    },
    createVersion: (taskId, file, notes) => {
      if (!demoMode) return setError("Uploads are not connected yet. This draft was not saved.")
      dispatch({ type: "create_version", taskId, file, notes, actor: currentUser })
    },
    submitLatestVersion: (taskId) => {
      if (!demoMode) return setError("Submitting work for review is not connected yet.")
      dispatch({ type: "submit_version", taskId, actor: currentUser })
    },
    reviewLatestVersion: (taskId, decision, comment) => {
      if (!demoMode) return setError("Review decisions are not connected yet.")
      dispatch({ type: "review_version", taskId, decision, comment, actor: currentUser })
    },
    createTask: async (input) => {
      const selectedAssignee = [...assignableUsers, ...clients.flatMap((client) => client.members ?? [])].find((member) => member.id === input.assigneeId)
      const owner: { id: string; name: string; role: string } = selectedAssignee
        ? { id: selectedAssignee.id, name: selectedAssignee.name, role: selectedAssignee.role }
        : demoMode && currentUser.role === "supervisor" && input.assigneeId === currentEmployee.id
          ? currentEmployee
          : currentUser
      const fakeId = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${crypto.randomUUID().slice(0, 6)}`
      let dueAt: string
      try {
        dueAt = input.dueAt ?? new Date((input.dueDate ?? "").replace(/[\u00b7\u2022]/g, " ")).toISOString()
      } catch {
        setError("Enter a valid due date.")
        return null
      }
      const created = demoMode ? null : await createTaskAction({
        title: input.title,
        clientId: input.clientId,
        campaign: input.campaign,
        priority: input.priority,
        assigneeId: input.assigneeId,
        dueAt,
        contentItemId: input.contentItemId,
      })
      const id = demoMode ? fakeId : created?.id
      if (!id) {
        if (!demoMode) setError(created?.error ?? "Task creation failed. Check your access and task details.")
        return null
      }
      dispatch({
        type: "create_task",
        actor: currentUser,
        task: {
          id,
          title: input.title,
          description: "New task created from the global task form.",
          clientId: input.clientId ?? "",
          clientName: input.clientName,
          campaign: input.campaign || "General work",
          contentItem: input.contentItemTitle ?? "General campaign work",
          contentItemId: input.contentItemId ?? null,
          priority: input.priority,
          status: "todo",
          startDate: "Today",
          dueDate: formatTaskDate(dueAt),
          dueAt,
          primaryOwner: { id: owner.id, name: owner.name, initials: owner.name.split(" ").map((part) => part[0]).join(""), role: owner.role === "employee" ? "Account Manager" : "Supervisor" },
          collaborators: [],
          checklist: [],
          comments: [],
          versions: [],
          activity: [{ id: crypto.randomUUID(), label: "Task created", actor: currentUser.name, createdAt: "Just now" }],
        },
      })
      return id
    },
    loadTaskDetails,
  }), [state.tasks, clients, assignableUsers, currentUser, demoMode, error, initialUpcomingContent, initialContentWorkItems, realtimeRevision, loadTaskDetails])

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflow() {
  const context = useContext(WorkflowContext)
  if (!context) throw new Error("useWorkflow must be used within WorkflowProvider")
  return context
}
