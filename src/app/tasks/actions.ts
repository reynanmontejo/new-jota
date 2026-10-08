"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const uuid = z.string().uuid()

export async function createTaskAction(input: {
  title: string
  clientId: string
  campaign: string
  priority: "low" | "medium" | "high" | "urgent"
  dueAt: string
  assigneeId: string
}) {
  const parsed = z.object({
    title: z.string().trim().min(2).max(220),
    clientId: uuid,
    campaign: z.string().trim().max(160),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    dueAt: z.iso.datetime(),
    assigneeId: uuid,
  }).safeParse(input)
  if (!parsed.success) return { id: null, error: "Check the task details and try again." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("workflow_create_task", {
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
  return { id: data, error: null }
}

export async function trashTaskAction(taskId: string) {
  if (!uuid.safeParse(taskId).success) return { error: "Invalid task." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("workflow_trash_task_for_current_user", { p_task_id: taskId })
  if (error) return { error: error.message }
  revalidatePath("/")
  revalidatePath("/tasks")
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

export async function listTaskTrashAction() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("workflow_list_task_trash")
  if (error) return { rows: null, error: error.message }
  return { rows: data ?? [], error: null }
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
