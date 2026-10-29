"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const uuid = z.string().uuid()

export async function createTaskAction(input: {
  title: string
  clientId: string | null
  campaign: string
  priority: "low" | "medium" | "high" | "urgent"
  dueAt: string
  assigneeId: string
  contentItemId?: string | null
  description?: string
  startAt?: string | null
  checklist?: string[]
}) {
  const parsed = z.object({
    title: z.string().trim().min(2).max(220),
    clientId: z.union([uuid, z.literal("")]).nullable().transform((value) => value || null),
    campaign: z.string().trim().max(160),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    dueAt: z.iso.datetime(),
    assigneeId: uuid,
    contentItemId: uuid.nullable().optional(),
    description: z.string().max(5000).optional(),
    startAt: z.iso.datetime().nullable().optional(),
    checklist: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
  }).safeParse(input)
  if (!parsed.success) return { id: null, error: "Check the task details and try again." }

  const supabase = await createClient()
  const { data, error } = parsed.data.contentItemId
    ? await supabase.rpc("workflow_create_task_for_content_with_details", {
      p_content_item_id: parsed.data.contentItemId,
      p_title: parsed.data.title,
      p_priority: parsed.data.priority,
      p_due_at: parsed.data.dueAt,
      p_assigned_to: parsed.data.assigneeId,
      p_description: parsed.data.description ?? "",
      p_start_at: parsed.data.startAt ?? null,
      p_checklist: parsed.data.checklist ?? [],
    })
    : await supabase.rpc("workflow_create_task", {
      p_title: parsed.data.title,
      p_client_id: parsed.data.clientId,
      p_campaign_name: parsed.data.campaign || null,
      p_priority: parsed.data.priority,
      p_due_at: parsed.data.dueAt,
      p_assigned_to: parsed.data.assigneeId,
    })
  if (error || !data) return { id: null, error: error?.message ?? "Task creation failed." }
  revalidatePath("/")
  revalidatePath("/tasks")
  revalidatePath("/content")
  revalidatePath("/calendar")
  return { id: data, error: null }
}

export async function trashTaskAction(taskId: string) {
  if (!uuid.safeParse(taskId).success) return { error: "Invalid task." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("workflow_trash_task_for_current_user", { p_task_id: taskId })
  if (error) return { error: error.message }
  revalidatePath("/")
  revalidatePath("/tasks")
  revalidatePath("/tasks/trash")
  return { error: null }
}

export async function restoreTaskFromTrashAction(taskId: string) {
  if (!uuid.safeParse(taskId).success) redirect("/tasks/trash?notice=restore-failed")
  const supabase = await createClient()
  const { error } = await supabase.rpc("workflow_restore_task_from_trash", { p_task_id: taskId })
  if (error) redirect("/tasks/trash?notice=restore-failed")
  revalidatePath("/")
  revalidatePath("/tasks")
  revalidatePath("/tasks/trash")
  redirect("/tasks/trash?notice=restored")
}

export async function undoTaskTrashAction(taskId: string) {
  if (!uuid.safeParse(taskId).success) return { error: "Invalid task." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("workflow_restore_task_from_trash", { p_task_id: taskId })
  if (error) return { error: error.message }
  revalidatePath("/")
  revalidatePath("/tasks")
  revalidatePath("/tasks/trash")
  return { error: null }
}

export async function listTaskTrashAction() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("workflow_list_task_trash")
  if (error) return { rows: null, error: error.message }
  return { rows: data ?? [], error: null }
}

export async function archiveCompletedTaskAction(taskId: string) {
  return trashTaskAction(taskId)
}

export async function restoreTaskFromArchiveAction(taskId: string) {
  return restoreTaskFromTrashAction(taskId)
}

export async function undoTaskArchiveAction(taskId: string) {
  return undoTaskTrashAction(taskId)
}

export async function manageTaskTrashAction(taskIds: string[], action: "restore" | "delete"): Promise<{ count: number; error: null } | { error: string }> {
  const parsed = z.object({ taskIds: z.array(uuid).min(1).max(5000), action: z.enum(["restore", "delete"]) }).safeParse({ taskIds, action })
  if (!parsed.success) return { error: "Choose valid tasks and try again." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("workflow_manage_task_trash", { p_task_ids: [...new Set(parsed.data.taskIds)], p_action: parsed.data.action })
  if (error?.code === "PGRST202") return { error: "Apply the unified Task Trash migration, then refresh this page." }
  if (error?.code === "42501") return { error: "You do not have access to manage one or more of these tasks." }
  if (error?.code === "22023" && error.message.includes("expired")) return { error: "The 30-day restore window has expired for one or more tasks. Refresh the list and try again." }
  if (error) return { error: "The Trash action could not be completed. Refresh and try again." }
  for (const path of ["/", "/tasks", "/tasks/trash", "/tasks/archive", "/insights", "/calendar"]) revalidatePath(path)
  return { count: typeof data === "number" ? data : 0, error: null }
}

export async function updateTaskStatusAction(taskId: string, status: string) {
  if (!uuid.safeParse(taskId).success || !z.enum(["todo", "in_progress", "for_review", "revision_requested", "approved", "completed", "cancelled"]).safeParse(status).success) {
    return { error: "Invalid task or status." }
  }
  const supabase = await createClient()
  const { error } = status === "cancelled"
    ? await supabase.rpc("workflow_cancel_task_for_current_user", { p_task_id: taskId, p_reason: null })
    : await supabase.rpc("workflow_update_task_status", { p_task_id: taskId, p_status: status as "todo" })
  if (error) return { error: error.message }
  revalidatePath("/")
  revalidatePath("/tasks")
  revalidatePath("/reviews")
  return { error: null }
}

export async function addTaskCommentAction(taskId: string, body: string) {
  if (!uuid.safeParse(taskId).success || !z.string().trim().min(1).max(10000).safeParse(body).success) {
    return { error: "Enter a comment and try again." }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("workflow_add_task_comment", { p_task_id: taskId, p_body: body.trim() })
  if (error) return { error: error.message }
  revalidatePath("/tasks")
  revalidatePath(`/tasks/${taskId}`)
  return { error: null }
}

export async function toggleTaskChecklistAction(taskId: string, itemId: string) {
  if (!uuid.safeParse(taskId).success || !uuid.safeParse(itemId).success) return { completed: null, error: "Invalid checklist item." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("workflow_toggle_checklist", { p_task_id: taskId, p_item_id: itemId })
  if (error) return { completed: null, error: error.message }
  revalidatePath("/tasks")
  revalidatePath(`/tasks/${taskId}`)
  return { completed: data, error: null }
}
