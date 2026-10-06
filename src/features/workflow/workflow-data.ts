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

  const [campaignResult, contentResult, assigneeResult, checklistResult, commentResult, activityResult] = await Promise.all([
    clientIds.length ? supabase.from("campaigns").select("id,name,client_id").is("deleted_at", null).in("client_id", clientIds) : Promise.resolve({ data: [], error: null }),
    contentIds.length ? supabase.from("content_items").select("id,title").in("id", contentIds) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("task_assignees").select("task_id,user_id,is_primary").is("removed_at", null).in("task_id", taskIds) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("task_checklist_items").select("id,task_id,title,is_completed,position").in("task_id", taskIds).order("position") : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("comments").select("id,task_id,author_id,body,created_at").is("deleted_at", null).in("task_id", taskIds).order("created_at") : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("activity_logs").select("id,entity_id,actor_id,action,created_at").eq("entity_type", "task").in("entity_id", taskIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [campaignResult, contentResult, assigneeResult, checklistResult, commentResult, activityResult]) {
    if (result.error) throw new Error(`Could not load task details: ${result.error.message}`)
  }

  const campaignRows = (campaignResult.data ?? []) as unknown as { id: string; name: string; client_id: string }[]
  const campaigns = new Map(campaignRows.map((row) => [row.id, row.name]))
  const content = new Map(((contentResult.data ?? []) as unknown as { id: string; title: string }[]).map((row) => [row.id, row.title]))
  const assignees = (assigneeResult.data ?? []) as unknown as DbAssignee[]
  const checklists = (checklistResult.data ?? []) as unknown as DbChecklist[]
  const comments = (commentResult.data ?? []) as unknown as DbComment[]
  const activities = (activityResult.data ?? []) as unknown as DbActivity[]
  const profileIds = [...new Set([
    ...assignees.map((row) => row.user_id),
    ...comments.map((row) => row.author_id),
    ...activities.flatMap((row) => row.actor_id ? [row.actor_id] : []),
  ])]
  const profileResult = profileIds.length
    ? await supabase.from("profiles").select("id,display_name,job_title").in("id", profileIds)
    : { data: [], error: null }
  if (profileResult.error) throw new Error(`Could not load task participants: ${profileResult.error.message}`)
  const profiles = new Map(((profileResult.data ?? []) as unknown as DbProfile[]).map((row) => [row.id, row]))
  const clientsWithCampaigns = clients.map((client) => ({
    ...client,
    campaigns: campaignRows.filter((campaign) => campaign.client_id === client.id).map(({ id, name }) => ({ id, name })),
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
        versions: [],
        activity: activities.filter((item) => item.entity_id === row.id).map((item) => ({
          id: item.id,
          label: actionLabel(item.action),
          actor: item.actor_id ? profiles.get(item.actor_id)?.display_name ?? "System" : "System",
          createdAt: displayDate(item.created_at),
        })),
      }
    }),
  }
}
