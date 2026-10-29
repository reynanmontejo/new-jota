import "server-only"

import type { WorkflowAssignableUser, WorkflowClient, WorkflowContentWorkItem, WorkflowTask, WorkflowTaskDetails, WorkflowUpcomingContent } from "@/features/workflow/types"
import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"
import type { WorkspaceRequestContext } from "@/lib/supabase/request-context"

type DbTask = {
  id: string
  title: string
  description: string | null
  client_id: string | null
  campaign_id: string | null
  content_item_id: string | null
  status: WorkflowTask["status"]
  priority: WorkflowTask["priority"]
  start_at: string | null
  due_at: string | null
  completed_at: string | null
  created_by: string | null
  linked_content: { title: string; status: string; client_approval_status: string | null } | null
  active_assignees: Array<{ user_id: string; is_primary: boolean }>
}
type DbClient = {
  id: string
  name: string
  active_campaigns: Array<{ id: string; name: string }>
  active_members: Array<{ user_id: string; client_role: string }>
}
type DbChecklist = { id: string; task_id: string; title: string; is_completed: boolean; position: number }
type DbComment = { id: string; task_id: string; author_id: string; body: string; created_at: string }
type DbActivity = { id: string; entity_id: string; actor_id: string | null; action: string; created_at: string }
type DbProfile = { id: string; display_name: string; job_title: string | null }
type DbSubmission = { id: string; task_id: string; current_version_number: number; status: string }
type DbSubmissionVersion = { id: string; task_id: string; submission_id: string; version_number: number; notes: string | null; submitted_by: string; submitted_at: string }
type DbSubmissionFile = { submission_version_id: string; attachment_id: string }
type DbAttachment = { id: string; file_name: string; mime_type: string; size_bytes: number }
type DbReview = { submission_version_id: string; reviewer_id: string; decision: string; comment: string | null; created_at: string }

function displayDate(value: string | null) {
  if (!value) return "Not set"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not set"
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date)
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
}

function actionLabel(action: string) {
  return action.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

export async function loadWorkflowData(): Promise<{ tasks: WorkflowTask[]; clients: WorkflowClient[]; assignableUsers: WorkflowAssignableUser[]; upcomingContent: WorkflowUpcomingContent[]; contentWorkItems: WorkflowContentWorkItem[] }> {
  const context = await getWorkspaceRequestContext()
  if (!context) throw new Error("Could not load the active workspace context.")
  const { supabase } = context
  const [taskResult, clientResult, contentWorkResult, profileResult] = await Promise.all([
    supabase.from("tasks")
      .select("id,title,description,client_id,campaign_id,content_item_id,status,priority,start_at,due_at,completed_at,created_by,linked_content:content_items(title,status,client_approval_status),active_assignees:task_assignees(user_id,is_primary)")
      .is("deleted_at", null).is("archived_at", null)
      .is("active_assignees.removed_at", null)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("clients")
      .select("id,name,active_campaigns:campaigns(id,name),active_members:client_members(user_id,client_role)")
      .is("deleted_at", null)
      .is("active_campaigns.deleted_at", null)
      .is("active_members.removed_at", null)
      .order("name"),
    supabase.from("content_items")
      .select("id,title,client_id,campaign_id,platform,content_type,content_category,description,status,publish_at,deadline_at,assigned_to")
      .in("status", ["idea", "planned", "in_production", "for_review", "revision_requested", "waiting_client", "scheduled"])
      .is("deleted_at", null)
      .order("publish_at", { ascending: true, nullsFirst: false }),
    // Names for embedded assignees and client members come from this parallel read.
    supabase.from("profiles").select("id,display_name,job_title,status,deactivated_at"),
  ])
  if (taskResult.error) throw new Error(`Could not load tasks: ${taskResult.error.message}`)
  if (clientResult.error) throw new Error(`Could not load available clients: ${clientResult.error.message}`)
  if (contentWorkResult.error) throw new Error(`Could not load content work: ${contentWorkResult.error.message}`)
  if (profileResult.error) throw new Error(`Could not load workflow participants: ${profileResult.error.message}`)

  const rows = (taskResult.data ?? []) as unknown as DbTask[]
  const clients = (clientResult.data ?? []) as unknown as DbClient[]
  const contentWorkRows = (contentWorkResult.data ?? []) as unknown as Array<{
    id: string; title: string; client_id: string; campaign_id: string; platform: string; content_type: string; content_category: "static" | "video" | "other"; description: string | null
    status: string; publish_at: string | null; deadline_at: string | null; assigned_to: string | null
  }>
  // Only fetch the summary fields used by shared navigation, task boards, and insights.
  // Comments, activity, checklist, and version history are fetched only when a task is opened.
  const campaignById = new Map(clients.flatMap((client) => client.active_campaigns.map((campaign) => [campaign.id, campaign.name] as const)))
  const profiles = new Map(((profileResult.data ?? []) as unknown as (DbProfile & { status?: string; deactivated_at?: string | null })[]).map((row) => [row.id, row]))
  const assignableUsers: WorkflowAssignableUser[] = [...profiles.values()]
    .filter((profile) => profile.status === "active" && !profile.deactivated_at)
    .map((profile) => ({ id: profile.id, name: profile.display_name, role: profile.job_title ?? "Employee" }))
  const clientsWithCampaigns = clients.map((client) => ({
    id: client.id,
    name: client.name,
    campaigns: client.active_campaigns,
    members: client.active_members.flatMap(({ user_id }) => {
      const profile = profiles.get(user_id)
      if (!profile || profile.status !== "active" || profile.deactivated_at) return []
      return [{ id: user_id, name: profile.display_name, role: profile.job_title ?? "Employee" }]
    }),
  }))
  const clientsById = new Map(clientsWithCampaigns.map((row) => [row.id, row.name]))
  const videoEditorByClient = new Map(clients.map((client) => [client.id, client.active_members.find((member) => member.client_role === "video_editor")?.user_id ?? null]))
  const upcomingContent: WorkflowUpcomingContent[] = contentWorkRows
    .filter((item) => ["planned", "in_production", "scheduled"].includes(item.status) && Boolean(item.publish_at) && item.publish_at! >= new Date().toISOString())
    .slice(0, 3)
    .map((item) => ({ id: item.id, title: item.title, clientId: item.client_id, clientName: clientsById.get(item.client_id) ?? "Client", platform: item.platform, publishAt: item.publish_at! }))
  const contentWorkItems: WorkflowContentWorkItem[] = contentWorkRows.flatMap((row) => {
    const clientName = clientsById.get(row.client_id)
    if (!clientName) return []
    const assignee = row.assigned_to ? profiles.get(row.assigned_to) : null
    return [{
      id: row.id,
      title: row.title,
      clientId: row.client_id,
      clientName,
      campaignName: campaignById.get(row.campaign_id) ?? "General / Ongoing",
      platform: row.platform,
      format: row.content_type,
      category: row.content_category,
      description: row.description,
      videoEditorId: videoEditorByClient.get(row.client_id) ?? null,
      status: row.status,
      publishAt: row.publish_at,
      deadlineAt: row.deadline_at,
      assigneeId: row.assigned_to,
      assigneeName: assignee?.display_name ?? null,
    }]
  })

  const tasks: WorkflowTask[] = rows.map((row) => {
    const taskAssignees = row.active_assignees
    const primary = taskAssignees.find((item) => item.is_primary) ?? taskAssignees[0]
    const primaryProfile = primary ? profiles.get(primary.user_id) : null
    const ownerName = primaryProfile?.display_name ?? "Unassigned"
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      clientId: row.client_id ?? "",
      clientName: row.client_id ? clientsById.get(row.client_id) ?? "Client" : "No client",
      campaign: (row.campaign_id && campaignById.get(row.campaign_id)) ?? "General work",
      contentItem: row.linked_content?.title ?? "General campaign work",
      contentItemId: row.content_item_id,
      contentClientApproval: ["for_review", "revision_requested"].includes(row.linked_content?.status ?? "") ? "pending" : row.linked_content?.client_approval_status ?? null,
      createdById: row.created_by,
      priority: row.priority,
      status: row.status,
      startDate: displayDate(row.start_at),
      dueDate: displayDate(row.due_at),
      dueAt: row.due_at,
      completedAt: row.completed_at,
      primaryOwner: {
        id: primary?.user_id ?? row.created_by ?? "unassigned",
        name: ownerName,
        initials: initials(ownerName),
        role: primaryProfile?.job_title ?? "Employee",
      },
      collaborators: taskAssignees.filter((item) => item.user_id !== primary?.user_id).flatMap((item) => {
        const profile = profiles.get(item.user_id)
        return profile ? [{ id: item.user_id, name: profile.display_name, initials: initials(profile.display_name), role: profile.job_title ?? "Employee" }] : []
      }),
      checklist: [],
      comments: [],
      versions: [],
      activity: [],
      detailsLoaded: false,
      fileCount: null,
      hasSubmissions: false,
    }
  })

  return { clients: clientsWithCampaigns, assignableUsers, upcomingContent, contentWorkItems, tasks }
}

type ServerSupabaseClient = WorkspaceRequestContext["supabase"]

export async function loadWorkflowTaskDetails(supabase: ServerSupabaseClient, taskId: string): Promise<WorkflowTaskDetails | null> {
  const taskResult = await supabase.from("tasks").select("id").eq("id", taskId).is("deleted_at", null).is("archived_at", null).maybeSingle()
  if (taskResult.error) throw new Error("Could not load task details.")
  if (!taskResult.data) return null

  const [checklistResult, commentResult, activityResult, submissionResult] = await Promise.all([
    supabase.from("task_checklist_items").select("id,task_id,title,is_completed,position").eq("task_id", taskId).order("position"),
    supabase.from("comments").select("id,task_id,author_id,body,created_at").eq("task_id", taskId).is("deleted_at", null).order("created_at"),
    supabase.from("activity_logs").select("id,entity_id,actor_id,action,created_at").eq("entity_type", "task").eq("entity_id", taskId).order("created_at", { ascending: false }),
    supabase.from("submissions").select("id,task_id,current_version_number,status").eq("task_id", taskId),
  ])
  for (const result of [checklistResult, commentResult, activityResult, submissionResult]) {
    if (result.error) throw new Error("Could not load task details.")
  }

  const checklists = (checklistResult.data ?? []) as unknown as DbChecklist[]
  const comments = (commentResult.data ?? []) as unknown as DbComment[]
  const activities = (activityResult.data ?? []) as unknown as DbActivity[]
  const submissions = (submissionResult.data ?? []) as unknown as DbSubmission[]
  const submissionIds = submissions.map((item) => item.id)
  const versionResult = submissionIds.length
    ? await supabase.from("submission_versions").select("id,task_id,submission_id,version_number,notes,submitted_by,submitted_at").in("submission_id", submissionIds).order("version_number")
    : { data: [], error: null }
  if (versionResult.error) throw new Error("Could not load task versions.")
  const versions = (versionResult.data ?? []) as unknown as DbSubmissionVersion[]
  const versionIds = versions.map((item) => item.id)
  const [versionFileResult, reviewResult] = await Promise.all([
    versionIds.length ? supabase.from("submission_version_files").select("submission_version_id,attachment_id").in("submission_version_id", versionIds) : Promise.resolve({ data: [], error: null }),
    versionIds.length ? supabase.from("reviews").select("submission_version_id,reviewer_id,decision,comment,created_at").in("submission_version_id", versionIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (versionFileResult.error || reviewResult.error) throw new Error("Could not load task review history.")
  const versionFiles = (versionFileResult.data ?? []) as unknown as DbSubmissionFile[]
  const reviews = (reviewResult.data ?? []) as unknown as DbReview[]
  const attachmentIds = [...new Set(versionFiles.map((item) => item.attachment_id))]
  const profileIds = [...new Set([
    ...comments.map((item) => item.author_id),
    ...activities.flatMap((item) => item.actor_id ? [item.actor_id] : []),
    ...versions.map((item) => item.submitted_by),
    ...reviews.map((item) => item.reviewer_id),
  ])]
  const [attachmentResult, profileResult] = await Promise.all([
    attachmentIds.length ? supabase.from("attachments").select("id,file_name,mime_type,size_bytes").in("id", attachmentIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? supabase.from("profiles").select("id,display_name,job_title").in("id", profileIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (attachmentResult.error || profileResult.error) throw new Error("Could not load task participants or files.")

  const profiles = new Map(((profileResult.data ?? []) as unknown as DbProfile[]).map((row) => [row.id, row]))
  const attachments = new Map(((attachmentResult.data ?? []) as unknown as DbAttachment[]).map((item) => [item.id, item]))
  const submissionByTask = new Map(submissions.map((item) => [item.task_id, item]))
  const filesByVersion = new Map<string, WorkflowTaskDetails["versions"][number]["files"]>()
  for (const item of versionFiles) {
    const attachment = attachments.get(item.attachment_id)
    if (!attachment) continue
    const files = filesByVersion.get(item.submission_version_id) ?? []
    files.push({ id: attachment.id, name: attachment.file_name, size: attachment.size_bytes, type: attachment.mime_type })
    filesByVersion.set(item.submission_version_id, files)
  }
  const reviewByVersion = new Map(reviews.map((review) => [review.submission_version_id, review]))

  return {
    checklist: checklists.map((item) => ({ id: item.id, label: item.title, completed: item.is_completed })),
    comments: comments.map((item) => {
      const author = profiles.get(item.author_id)?.display_name ?? "Teammate"
      return { id: item.id, author, initials: initials(author), body: item.body, createdAt: displayDate(item.created_at) }
    }),
    versions: versions.map((version) => {
      const review = reviewByVersion.get(version.id)
      const submitter = profiles.get(version.submitted_by)?.display_name ?? "Teammate"
      const currentSubmission = submissionByTask.get(taskId)
      const status = review?.decision ?? (currentSubmission?.status === "revision_requested" && version.version_number === currentSubmission.current_version_number ? "revision_requested" : currentSubmission?.status === "approved" && version.version_number === currentSubmission.current_version_number ? "approved" : "submitted")
      return {
        id: version.id,
        number: version.version_number,
        status: status as WorkflowTask["versions"][number]["status"],
        notes: version.notes ?? "",
        submittedBy: submitter,
        submittedById: version.submitted_by,
        submittedAt: displayDate(version.submitted_at),
        files: filesByVersion.get(version.id) ?? [],
        reviewComment: review?.comment ?? undefined,
        reviewedBy: review ? profiles.get(review.reviewer_id)?.display_name ?? "Supervisor" : undefined,
        reviewedAt: review ? displayDate(review.created_at) : undefined,
      }
    }),
    activity: activities.map((item) => ({
      id: item.id,
      label: actionLabel(item.action),
      actor: item.actor_id ? profiles.get(item.actor_id)?.display_name ?? "System" : "System",
      createdAt: displayDate(item.created_at),
    })),
  }
}
