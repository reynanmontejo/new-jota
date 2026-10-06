"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const uuid = z.string().uuid()

export async function createTaskAction(input: {
  title: string
  clientId: string
  campaign: string
  priority: "low" | "medium" | "high" | "urgent"
  dueAt: string
}) {
  const parsed = z.object({
    title: z.string().trim().min(2).max(220),
    clientId: uuid,
    campaign: z.string().trim().min(2).max(160),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    dueAt: z.iso.datetime(),
  }).safeParse(input)
  if (!parsed.success) return { id: null, error: "Check the task details and try again." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("workflow_create_task", {
    p_title: parsed.data.title,
    p_client_id: parsed.data.clientId,
    p_campaign_name: parsed.data.campaign,
    p_priority: parsed.data.priority,
    p_due_at: parsed.data.dueAt,
  })
  if (error || !data) return { id: null, error: error?.message ?? "Task creation failed." }
  revalidatePath("/")
  revalidatePath("/tasks")
  return { id: data, error: null }
}

export async function updateTaskStatusAction(taskId: string, status: string) {
  if (!uuid.safeParse(taskId).success || !z.enum(["todo", "in_progress", "for_review", "revision_requested", "approved", "completed", "cancelled"]).safeParse(status).success) {
    return { error: "Invalid task or status." }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("workflow_update_task_status", { p_task_id: taskId, p_status: status as "todo" })
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
