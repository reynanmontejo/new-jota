import { notFound } from "next/navigation"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ContentState } from "@/components/states/content-state"
import { ClientRecordView, type AssignableAccountManager, type AssignableVideoEditor, type ClientRecord } from "@/features/clients/client-record-view"
import type { ClientActivityItem, ClientTeamMember } from "@/features/clients/client-record-view"
import { ClientWorkspace } from "@/features/clients/client-workspace"
import type { CampaignRecord } from "@/features/clients/campaign-manager"
import type { ContentCalendarPost } from "@/features/calendar/content-calendar"
import { initialWorkflowState } from "@/features/workflow/mock-data"
import { isSupabaseConfigured } from "@/lib/env"
import { getCampaignPermissions } from "@/lib/supabase/campaign-admin"
import { getClientAssignmentContext, getClientLifecyclePermissions } from "@/lib/supabase/client-admin"
import { createClient } from "@/lib/supabase/server"

const demoClientIds = new Set(["luma-skincare", "northwind-coffee", "harbor-and-pine"])

export default async function ClientPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ tab?: string; notice?: string }> }) {
  const [{ clientId }, { tab, notice }] = await Promise.all([params, searchParams])

  if (!isSupabaseConfigured()) {
    const visibleDemoClients = new Set(initialWorkflowState.tasks.map((task) => task.clientId))
    if (!demoClientIds.has(clientId) || !visibleDemoClients.has(clientId)) notFound()
    return <DashboardShell><ClientWorkspace clientId={clientId} initialTab={tab} /></DashboardShell>
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase.from("clients")
    .select("id, organization_id, name, description, website_url, social_platforms, status")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle()

  // The query is RLS-scoped; unavailable and unauthorized records must not leak.
  if (error || !row) notFound()
  const { data: authData } = await supabase.auth.getUser()

  const [campaignResult, taskResult, contentResult, teamResult, campaignPermissions, assignmentContext, lifecyclePermissions] = await Promise.all([
    supabase.from("campaigns").select("id,client_id,name,description,status,start_date,end_date").eq("client_id", clientId).is("deleted_at", null).order("start_date", { ascending: true, nullsFirst: false }).order("name"),
    supabase.from("tasks").select("id,title,campaign_id,status,due_at").eq("client_id", clientId).is("deleted_at", null).is("archived_at", null).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("content_items").select("id,title,client_id,platform,content_type,description,status,publish_at,next_action,revision_notes").eq("client_id", clientId).is("deleted_at", null).order("publish_at", { ascending: true, nullsFirst: false }),
    supabase.from("client_members").select("user_id,client_role,is_primary,assigned_at").eq("client_id", clientId).is("removed_at", null).order("is_primary", { ascending: false }).order("assigned_at"),
    getCampaignPermissions(),
    getClientAssignmentContext(),
    getClientLifecyclePermissions(),
  ])

  if (campaignResult.error || taskResult.error || teamResult.error) {
    return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Client details couldn’t be loaded" description="Refresh and try again. The client record has not been changed." /></main></DashboardShell>
  }

  const campaignRows = (campaignResult.data ?? []) as CampaignRecord[]
  const taskRows = taskResult.data ?? []
  const contentRows = contentResult.data ?? []
  const teamRows = teamResult.data ?? []
  const canManageVideoEditor = Boolean(assignmentContext || teamRows.some((member) => member.user_id === authData.user?.id && member.client_role === "account_manager"))
  let assignableVideoEditors: AssignableVideoEditor[] = []
  if (canManageVideoEditor) {
    const editorCandidatesResult = await supabase.rpc("workflow_list_client_video_editor_candidates", { p_client_id: clientId })
    if (editorCandidatesResult.error) {
      return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Video Editor choices couldn’t be loaded" description="Apply the client/editor workflow migration, then refresh. No client assignments were changed." /></main></DashboardShell>
    }
    assignableVideoEditors = ((editorCandidatesResult.data ?? []) as Array<{ user_id: string; display_name: string; job_title: string | null }>).map((candidate) => ({ id: candidate.user_id, name: candidate.display_name, jobTitle: candidate.job_title }))
  }
  let assignableAccountManagers: AssignableAccountManager[] = []
  if (assignmentContext) {
    const managerRolesResult = await supabase.from("roles").select("id")
      .eq("organization_id", row.organization_id).eq("code", "account_manager")
    if (managerRolesResult.error) {
      return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Account Manager list couldn’t be loaded" description="Refresh and try again. No client data was changed." /></main></DashboardShell>
    }
    const managerRoleIds = managerRolesResult.data.map((role) => role.id)
    const managerAssignments = managerRoleIds.length ? await supabase.from("user_roles").select("user_id")
      .eq("organization_id", row.organization_id).in("role_id", managerRoleIds) : { data: [], error: null }
    if (managerAssignments.error) {
      return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Account Manager list couldn’t be loaded" description="Refresh and try again. No client data was changed." /></main></DashboardShell>
    }
    const managerIds = [...new Set(managerAssignments.data.map((assignment) => assignment.user_id))]
    const managerProfiles = managerIds.length ? await supabase.from("profiles").select("id,display_name,job_title")
      .eq("organization_id", row.organization_id).eq("status", "active").is("deactivated_at", null).in("id", managerIds)
      .order("display_name") : { data: [], error: null }
    if (managerProfiles.error) {
      return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Account Manager list couldn’t be loaded" description="Refresh and try again. No client data was changed." /></main></DashboardShell>
    }
    assignableAccountManagers = (managerProfiles.data ?? []).map((profile) => ({ id: profile.id, name: profile.display_name, jobTitle: profile.job_title }))
  }
  const campaignIds = campaignRows.map((campaign) => campaign.id)
  const taskIds = taskRows.map((task) => task.id)
  const contentIds = contentRows.map((item) => item.id)
  const activityResults = await Promise.all([
    supabase.from("activity_logs").select("id,entity_type,entity_id,actor_id,action,created_at").eq("entity_type", "client").eq("entity_id", clientId),
    campaignIds.length ? supabase.from("activity_logs").select("id,entity_type,entity_id,actor_id,action,created_at").eq("entity_type", "campaign").in("entity_id", campaignIds) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("activity_logs").select("id,entity_type,entity_id,actor_id,action,created_at").eq("entity_type", "task").in("entity_id", taskIds) : Promise.resolve({ data: [], error: null }),
    contentIds.length ? supabase.from("activity_logs").select("id,entity_type,entity_id,actor_id,action,created_at").eq("entity_type", "content_item").in("entity_id", contentIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (activityResults.some((result) => result.error)) {
    return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Client activity could not be loaded" description="Refresh and try again. No client data was changed." /></main></DashboardShell>
  }
  const activityRows = activityResults.flatMap((result) => result.data ?? []) as Array<{
    id: string
    entity_type: string
    entity_id: string
    actor_id: string | null
    action: string
    created_at: string
  }>
  const memberIds = teamRows.map((member) => member.user_id)
  const actorIds = activityRows.flatMap((item) => item.actor_id ? [item.actor_id] : [])
  const profileIds = [...new Set([...memberIds, ...actorIds])]
  const profileResult = profileIds.length
    ? await supabase.from("profiles").select("id,display_name,job_title,avatar_url,status,deactivated_at").in("id", profileIds)
    : { data: [], error: null }
  if (profileResult.error) {
    return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Client team details could not be loaded" description="Refresh and try again. No client data was changed." /></main></DashboardShell>
  }
  const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]))
  const videoEditorById = new Map(assignableVideoEditors.map((editor) => [editor.id, editor]))

  const client = {
    ...row,
    status: row.status as ClientRecord["status"],
    campaignCount: campaignRows.length,
    openTaskCount: taskRows.filter((task) => !["approved", "completed", "cancelled"].includes(task.status)).length,
  } satisfies ClientRecord

  const activeTab = ["campaigns", "calendar", "tasks", "files", "team", "activity"].includes(tab ?? "")
    ? tab as "campaigns" | "calendar" | "tasks" | "files" | "team" | "activity"
    : "overview"
  const contentPosts: ContentCalendarPost[] = contentRows.flatMap((item) => item.publish_at ? [{
    id: item.id,
    date: item.publish_at,
    title: item.title,
    clientId: item.client_id,
    client: row.name,
    channel: item.platform,
    contentType: item.content_type,
    status: item.status,
    description: item.description,
    nextAction: item.next_action,
    revisionNotes: item.revision_notes,
  }] : [])
  const team: ClientTeamMember[] = teamRows.flatMap((member) => {
    const profile = profileById.get(member.user_id)
    const candidate = videoEditorById.get(member.user_id)
    if (profile && (profile.status !== "active" || profile.deactivated_at)) return []
    if (!profile && !candidate && member.client_role !== "video_editor") return []
    return [{ id: member.user_id, name: profile?.display_name ?? candidate?.name ?? "Assigned Video Editor", jobTitle: profile?.job_title ?? candidate?.jobTitle ?? null, role: member.client_role, isPrimary: member.is_primary, avatarUrl: profile?.avatar_url ?? null }]
  })
  const entityNames = new Map<string, string>()
  entityNames.set(`client:${clientId}`, row.name)
  for (const task of taskRows) entityNames.set(`task:${task.id}`, task.title)
  for (const item of contentRows) entityNames.set(`content_item:${item.id}`, item.title)
  for (const campaign of campaignRows) entityNames.set(`campaign:${campaign.id}`, campaign.name)
  const activity: ClientActivityItem[] = activityRows.map((item) => ({
    id: item.id,
    action: item.action.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
    entity: entityNames.get(`${item.entity_type}:${item.entity_id}`) ?? "Workspace item",
    actor: item.actor_id ? profileById.get(item.actor_id)?.display_name ?? "Former member" : "System",
    createdAt: item.created_at,
  })).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return <DashboardShell><ClientRecordView client={client} activeTab={activeTab} campaigns={campaignRows} campaignPermissions={campaignPermissions} contentPosts={contentPosts} contentError={Boolean(contentResult.error)} team={team} assignableAccountManagers={assignableAccountManagers} assignableVideoEditors={assignableVideoEditors} canManageAssignments={Boolean(assignmentContext)} canManageVideoEditor={canManageVideoEditor} canManageStatus={Boolean(lifecyclePermissions?.canManageStatus)} canManageTrash={Boolean(lifecyclePermissions?.canManageTrash)} activity={activity} notice={notice} /></DashboardShell>
}
