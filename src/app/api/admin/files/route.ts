import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { createServiceClient } from "@/lib/supabase/service"

type AdminFileRow = {
  id: string
  file_name: string
  mime_type: string
  size_bytes: number
  created_at: string
  deleted_at: string | null
  client_id: string
  campaign_id: string | null
  task_id: string | null
  content_item_id?: string | null
  uploaded_by: string
}

export async function GET(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["storage.manage"])) return NextResponse.json({ error: "Administrator access required." }, { status: 403 })

  const status = request.nextUrl.searchParams.get("status") === "trash" ? "trash" : "active"
  const service = createServiceClient()
  const columnsWithContent = "id,file_name,mime_type,size_bytes,created_at,deleted_at,client_id,campaign_id,task_id,content_item_id,uploaded_by"
  const columnsWithoutContent = "id,file_name,mime_type,size_bytes,created_at,deleted_at,client_id,campaign_id,task_id,uploaded_by"
  let query = service.from("attachments")
    .select(columnsWithContent)
    .eq("organization_id", actor.organizationId)
    .order("created_at", { ascending: false })
    .limit(500)
  query = status === "trash" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  const firstResult = await query
  let files = firstResult.data as unknown as AdminFileRow[] | null
  let error = firstResult.error
  let contentReviewReady = true
  if (["42703", "PGRST204"].includes(error?.code ?? "") && error?.message.toLowerCase().includes("content_item_id")) {
    contentReviewReady = false
    let fallbackQuery = service.from("attachments")
      .select(columnsWithoutContent)
      .eq("organization_id", actor.organizationId)
      .order("created_at", { ascending: false })
      .limit(500)
    fallbackQuery = status === "trash" ? fallbackQuery.not("deleted_at", "is", null) : fallbackQuery.is("deleted_at", null)
    const fallback = await fallbackQuery
    files = fallback.data as unknown as AdminFileRow[] | null
    error = fallback.error
  }
  if (error) {
    console.error("[admin file list failed]", { code: error.code, message: error.message })
    return NextResponse.json({ error: "Could not load organization files. Check the admin file API and latest database migrations." }, { status: 503 })
  }
  const items = (files ?? []).map((file) => ({ ...file, content_item_id: file.content_item_id ?? null }))
  const ids = items.map((file) => file.id)
  const clientIds = [...new Set(items.map((file) => file.client_id))]
  const campaignIds = [...new Set(items.flatMap((file) => file.campaign_id ? [file.campaign_id] : []))]
  const taskIds = [...new Set(items.flatMap((file) => file.task_id ? [file.task_id] : []))]
  const contentItemIds = [...new Set(items.flatMap((file) => file.content_item_id ? [file.content_item_id] : []))]
  const uploaderIds = [...new Set(items.map((file) => file.uploaded_by))]

  const [clientsResult, campaignsResult, tasksResult, contentResult, profilesResult, taskRefsResult, contentRefsResult] = await Promise.all([
    clientIds.length ? service.from("clients").select("id,name").eq("organization_id", actor.organizationId).in("id", clientIds) : Promise.resolve({ data: [], error: null }),
    campaignIds.length ? service.from("campaigns").select("id,name").eq("organization_id", actor.organizationId).in("id", campaignIds) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? service.from("tasks").select("id,title").eq("organization_id", actor.organizationId).in("id", taskIds) : Promise.resolve({ data: [], error: null }),
    contentItemIds.length ? service.from("content_items").select("id,title").eq("organization_id", actor.organizationId).in("id", contentItemIds) : Promise.resolve({ data: [], error: null }),
    uploaderIds.length ? service.from("profiles").select("id,display_name,email").eq("organization_id", actor.organizationId).in("id", uploaderIds) : Promise.resolve({ data: [], error: null }),
    ids.length ? service.from("submission_version_files").select("attachment_id").eq("organization_id", actor.organizationId).in("attachment_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length && contentReviewReady ? service.from("content_submission_version_files").select("attachment_id").eq("organization_id", actor.organizationId).in("attachment_id", ids) : Promise.resolve({ data: [], error: null }),
  ])
  if ([clientsResult, campaignsResult, tasksResult, contentResult, profilesResult, taskRefsResult].some((result) => result.error)) {
    console.error("[admin file details failed]", [clientsResult, campaignsResult, tasksResult, contentResult, profilesResult, taskRefsResult].filter((result) => result.error).map((result) => result.error && ({ code: result.error.code, message: result.error.message })))
    return NextResponse.json({ error: "File details could not be loaded. Apply the latest database migrations and retry." }, { status: 503 })
  }
  if (contentRefsResult.error && !["42P01", "42703", "PGRST204", "PGRST205"].includes(contentRefsResult.error.code ?? "")) {
    console.error("[admin content file history lookup failed]", { code: contentRefsResult.error.code, message: contentRefsResult.error.message })
    return NextResponse.json({ error: "Content submission history could not be checked. No file changes are available until the database is updated." }, { status: 503 })
  }
  if (contentRefsResult.error) contentReviewReady = false
  const clientNames = new Map((clientsResult.data ?? []).map((row) => [row.id, row.name]))
  const campaignNames = new Map((campaignsResult.data ?? []).map((row) => [row.id, row.name]))
  const taskNames = new Map((tasksResult.data ?? []).map((row) => [row.id, row.title]))
  const contentNames = new Map((contentResult.data ?? []).map((row) => [row.id, row.title]))
  const uploaderNames = new Map((profilesResult.data ?? []).map((row) => [row.id, row.display_name || row.email]))
  const protectedIds = new Set([...(taskRefsResult.data ?? []), ...(contentRefsResult.data ?? [])].map((row) => row.attachment_id))
  return NextResponse.json({
    files: items.map((file) => ({
      ...file,
      client_name: clientNames.get(file.client_id) ?? "Client",
      campaign_name: file.campaign_id ? campaignNames.get(file.campaign_id) ?? null : null,
      task_title: file.task_id ? taskNames.get(file.task_id) ?? null : null,
      content_title: file.content_item_id ? contentNames.get(file.content_item_id) ?? null : null,
      uploader_name: uploaderNames.get(file.uploaded_by) ?? "Unknown user",
      in_submission_history: protectedIds.has(file.id),
    })),
    contentReviewReady,
    limited: items.length === 500,
  }, { headers: { "cache-control": "private, no-store" } })
}
