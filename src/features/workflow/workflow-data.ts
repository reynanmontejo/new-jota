import "server-only"

import type { WorkflowClient, WorkflowTask, WorkflowUpcomingContent } from "@/features/workflow/types"
import { createClient } from "@/lib/supabase/server"

type DbTask = {
  id: string
  title: string
  description: string | null
  client_id: string
  campaign_id: string | null
  content_item_id: string | null
  status: WorkflowTask["status"]
  priority: WorkflowTask["priority"]
  start_at: string | null
  due_at: string | null
  created_by: string | null
}
type DbAssignee = { task_id: string; user_id: string; is_primary: boolean; profiles?: { display_name: string; job_title: string | null } | null }
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

export async function loadWorkflowData(): Promise<{ tasks: WorkflowTask[]; clients: WorkflowClient[]; upcomingContent: WorkflowUpcomingContent[] }> {
  const supabase = await createClient()
  const [taskResult, clientResult] = await Promise.all([
    supabase.from("tasks").select("id,title,description,client_id,campaign_id,content_item_id,status,priority,start_at,due_at,created_by,created_at").is("deleted_at", null).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("clients").select("id,name").is("deleted_at", null).order("name"),
  ])
  if (taskResult.error) throw new Error(`Could not load tasks: ${taskResult.error.message}`)
  if (clientResult.error) throw new Error(`Could not load available clients: ${clientResult.error.message}`)

  const rows = (taskResult.data ?? []) as unknown as (DbTask & { created_at: string })[]
  const clients = (clientResult.data ?? []) as unknown as WorkflowClient[]
  const clientNames = new Map(clients.map((client) => [client.id, client.name]))
  const upcomingResult = await supabase.from("content_items")
    .select("id,title,client_id,platform,publish_at")
    .in("status", ["planned", "in_production", "scheduled"])
    .not("publish_at", "is", null)
    .is("deleted_at", null)
    .gte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: true })
    .limit(3)
  if (upcomingResult.error) throw new Error(`Could not load upcoming content: ${upcomingResult.error.message}`)
  const upcomingContent = ((upcomingResult.data ?? []) as unknown as { id: string; title: string; client_id: string; platform: string; publish_at: string }[])
    .map((item) => ({ id: item.id, title: item.title, clientId: item.client_id, clientName: clientNames.get(item.client_id) ?? "Client", platform: item.platform, publishAt: item.publish_at }))
  const taskIds = rows.map((row) => row.id)
  const clientIds = clients.map((client) => client.id)
  const contentIds = [...new Set(rows.flatMap((row) => row.content_item_id ? [row.content_item_id] : []))]

  const [campaignResult, contentResult, assigneeResult, checklistResult, commentResult, activityResult, submissionResult, taskAttachmentResult] = await Promise.all([
    clientIds.length ? supabase.from("campaigns").select("id,name,client_id").is("deleted_at", null).in("client_id", clientIds) : Promise.resolve({ data: [], error: null }),
    contentIds.length ? supabase.from("content_items").select("id,title").in("id", contentIds) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("task_assignees").select("task_id,user_id,is_primary").is("removed_at", null).in("task_id", taskIds) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("task_checklist_items").select("id,task_id,title,is_completed,position").in("task_id", taskIds).order("position") : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("comments").select("id,task_id,author_id,body,created_at").is("deleted_at", null).in("task_id", taskIds).order("created_at") : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("activity_logs").select("id,entity_id,actor_id,action,created_at").eq("entity_type", "task").in("entity_id", taskIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("submissions").select("id,task_id,current_version_number,status").in("task_id", taskIds) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("attachments").select("task_id").in("task_id", taskIds) : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [campaignResult, contentResult, assigneeResult, checklistResult, commentResult, activityResult, submissionResult]) {
    if (result.error) throw new Error(`Could not load task details: ${result.error.message}`)
  }

  const campaignRows = (campaignResult.data ?? []) as unknown as { id: string; name: string; client_id: string }[]
  const campaigns = new Map(campaignRows.map((row) => [row.id, row.name]))
  const content = new Map(((contentResult.data ?? []) as unknown as { id: string; title: string }[]).map((row) => [row.id, row.title]))
  const assignees = (assigneeResult.data ?? []) as unknown as DbAssignee[]
  const checklists = (checklistResult.data ?? []) as unknown as DbChecklist[]
  const comments = (commentResult.data ?? []) as unknown as DbComment[]
  const activities = (activityResult.data ?? []) as unknown as DbActivity[]
  const submissions = (submissionResult.data ?? []) as unknown as DbSubmission[]
  const taskFileCounts = new Map<string, number>()
  for (const attachment of (taskAttachmentResult.data ?? []) as unknown as { task_id: string | null }[]) {
    if (attachment.task_id) taskFileCounts.set(attachment.task_id, (taskFileCounts.get(attachment.task_id) ?? 0) + 1)
  }
  const clientMemberResult = clientIds.length
    ? await supabase.from("client_members").select("client_id,user_id").is("removed_at", null).in("client_id", clientIds)
    : { data: [], error: null }
  if (clientMemberResult.error) throw new Error(`Could not load client task assignees: ${clientMemberResult.error.message}`)
  const clientMembers = (clientMemberResult.data ?? []) as unknown as { client_id: string; user_id: string }[]
  const submissionIds = submissions.map((item) => item.id)
  const versionResult = submissionIds.length
    ? await supabase.from("submission_versions").select("id,task_id,submission_id,version_number,notes,submitted_by,submitted_at").in("submission_id", submissionIds).order("version_number")
    : { data: [], error: null }
  if (versionResult.error) throw new Error(`Could not load task submission versions: ${versionResult.error.message}`)
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
  const attachmentResult = attachmentIds.length
    ? await supabase.from("attachments").select("id,file_name,mime_type,size_bytes").in("id", attachmentIds)
    : { data: [], error: null }
  if (attachmentResult.error) throw new Error("Could not load submitted task files.")
  const attachments = new Map(((attachmentResult.data ?? []) as unknown as DbAttachment[]).map((item) => [item.id, item]))
  const profileIds = [...new Set([
    ...clientMembers.map((row) => row.user_id),
    ...assignees.map((row) => row.user_id),
    ...comments.map((row) => row.author_id),
    ...activities.flatMap((row) => row.actor_id ? [row.actor_id] : []),
    ...versions.map((row) => row.submitted_by),
    ...reviews.map((row) => row.reviewer_id),
  ])]
  const profileResult = profileIds.length
    ? await supabase.from("profiles").select("id,display_name,job_title,status,deactivated_at").in("id", profileIds)
    : { data: [], error: null }
  if (profileResult.error) throw new Error(`Could not load task participants: ${profileResult.error.message}`)
  const profiles = new Map(((profileResult.data ?? []) as unknown as (DbProfile & { status?: string; deactivated_at?: string | null })[]).map((row) => [row.id, row]))
  const submissionByTask = new Map(submissions.map((item) => [item.task_id, item]))
  const clientsWithCampaigns = clients.map((client) => ({
    ...client,
    campaigns: campaignRows.filter((campaign) => campaign.client_id === client.id).map(({ id, name }) => ({ id, name })),
    members: clientMembers.flatMap((member) => {
      if (member.client_id !== client.id) return []
      const profile = profiles.get(member.user_id)
      if (!profile || profile.status !== "active" || profile.deactivated_at) return []
      return [{ id: profile.id, name: profile.display_name, role: profile.job_title ?? "Employee" }]
    }),
  }))
  const clientsById = new Map(clientsWithCampaigns.map((row) => [row.id, row.name]))

  return {
    clients: clientsWithCampaigns,
    upcomingContent,
    tasks: rows.map((row) => {
      const taskAssignees = assignees.filter((item) => item.task_id === row.id)
      const primary = taskAssignees.find((item) => item.is_primary) ?? taskAssignees[0]
      const primaryProfile = primary ? profiles.get(primary.user_id) : null
      const ownerName = primaryProfile?.display_name ?? "Unassigned"
      return {
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        clientId: row.client_id,
        clientName: clientsById.get(row.client_id) ?? "Client",
        campaign: (row.campaign_id && campaigns.get(row.campaign_id)) ?? "General work",
        contentItem: (row.content_item_id && content.get(row.content_item_id)) ?? "General campaign work",
        priority: row.priority,
        status: row.status,
        startDate: displayDate(row.start_at),
        dueDate: displayDate(row.due_at),
        dueAt: row.due_at,
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
        checklist: checklists.filter((item) => item.task_id === row.id).map((item) => ({ id: item.id, label: item.title, completed: item.is_completed })),
        comments: comments.filter((item) => item.task_id === row.id).map((item) => {
          const author = profiles.get(item.author_id)?.display_name ?? "Teammate"
          return { id: item.id, author, initials: initials(author), body: item.body, createdAt: displayDate(item.created_at) }
        }),
        versions: versions.filter((version) => version.task_id === row.id).map((version) => {
          const review = reviews.find((item) => item.submission_version_id === version.id)
          const submitter = profiles.get(version.submitted_by)?.display_name ?? "Teammate"
          const status = review?.decision ?? (submissionByTask.get(row.id)?.status === "revision_requested" && version.version_number === submissionByTask.get(row.id)?.current_version_number ? "revision_requested" : submissionByTask.get(row.id)?.status === "approved" && version.version_number === submissionByTask.get(row.id)?.current_version_number ? "approved" : "submitted")
          return {
            id: version.id,
            number: version.version_number,
            status: status as WorkflowTask["versions"][number]["status"],
            notes: version.notes ?? "",
            submittedBy: submitter,
            submittedById: version.submitted_by,
            submittedAt: displayDate(version.submitted_at),
            files: versionFiles.filter((item) => item.submission_version_id === version.id).flatMap((item) => {
              const attachment = attachments.get(item.attachment_id)
              return attachment ? [{ id: attachment.id, name: attachment.file_name, size: attachment.size_bytes, type: attachment.mime_type }] : []
            }),
            reviewComment: review?.comment ?? undefined,
            reviewedBy: review ? profiles.get(review.reviewer_id)?.display_name ?? "Supervisor" : undefined,
            reviewedAt: review ? displayDate(review.created_at) : undefined,
          }
        }),
        activity: activities.filter((item) => item.entity_id === row.id).map((item) => ({
          id: item.id,
          label: actionLabel(item.action),
          actor: item.actor_id ? profiles.get(item.actor_id)?.display_name ?? "System" : "System",
          createdAt: displayDate(item.created_at),
        })),
        fileCount: taskAttachmentResult.error ? null : taskFileCounts.get(row.id) ?? 0,
        hasSubmissions: submissions.some((submission) => submission.task_id === row.id),
      }
    }),
  }
}
