import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ContentState } from "@/components/states/content-state"
import { ContentTracker, type TrackerAssignee, type TrackerCampaign, type TrackerClient, type TrackerItem } from "@/features/content/content-tracker"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[]; added?: string; duplicates?: string; view?: string }> }) {
  const params = await searchParams
  const importedCount = params.added && /^\d+$/.test(params.added) ? Number(params.added) : undefined
  const skippedCount = params.duplicates && /^\d+$/.test(params.duplicates) ? Number(params.duplicates) : undefined
  if (!isSupabaseConfigured()) {
    return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Connect the workspace database to use the content tracker" description="The tracker stores client content and publishing dates in Supabase. Configure the project environment, then reload." /></main></DashboardShell>
  }

  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="access_denied" title="Sign in to view content" description="Your content tracker is available to active workspace members." /></main></DashboardShell>

  const { data: profile } = await supabase.from("profiles").select("organization_id,status,deactivated_at").eq("id", authData.user.id).maybeSingle()
  if (!profile || profile.status !== "active" || profile.deactivated_at) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="access_denied" title="Workspace access is unavailable" description="An active employee profile is required to access tracked content." /></main></DashboardShell>

  const { data: memberships, error: roleError } = await supabase.from("user_roles").select("role_id").eq("organization_id", profile.organization_id).eq("user_id", authData.user.id)
  if (roleError || !memberships?.length) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Content access couldn’t be checked" description="Refresh the page. No content was changed." /></main></DashboardShell>

  const { data: permissions, error: permissionError } = await supabase.from("role_permissions").select("permission_code").eq("organization_id", profile.organization_id).in("role_id", memberships.map((membership) => membership.role_id)).in("permission_code", ["content.create", "content.update"])
  if (permissionError) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Content permissions couldn’t be loaded" description="Refresh the page. No content was changed." /></main></DashboardShell>
  const canCreate = Boolean(permissions?.some((permission) => permission.permission_code === "content.create"))
  const canEdit = Boolean(permissions?.some((permission) => permission.permission_code === "content.update"))

  const { data: clientsData, error: clientsError } = await supabase.from("clients").select("id,name").is("deleted_at", null).order("name")
  if (clientsError) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Clients couldn’t be loaded for the tracker" description="Check your client access, then refresh. No records were changed." /></main></DashboardShell>
  const clients = (clientsData ?? []) as TrackerClient[]
  const clientIds = clients.map((client) => client.id)
  const [campaignResult, contentResult, membersResult] = clientIds.length ? await Promise.all([
    supabase.from("campaigns").select("id,client_id,name").is("deleted_at", null).in("client_id", clientIds).order("name"),
    supabase.from("content_items").select("id,client_id,campaign_id,title,platform,content_type,description,status,work_date,deadline_at,publish_at,client_approval_status,client_issues,notes,revision_count,revision_notes,next_action,assigned_to").is("deleted_at", null).in("client_id", clientIds).order("publish_at", { ascending: true, nullsFirst: false }),
    supabase.from("client_members").select("client_id,user_id").is("removed_at", null).in("client_id", clientIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]

  if (campaignResult.error) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Campaigns couldn’t be loaded" description="Refresh the page. Your client and campaign records have not been changed." /></main></DashboardShell>
  if (membersResult.error) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Client collaborators couldn’t be loaded" description="Refresh the page. Content records have not been changed." /></main></DashboardShell>
  if (contentResult.error) {
    const errorText = contentResult.error.message.toLowerCase()
    const migrationMissing = ["revision_count", "next_action", "assigned_to", "revision_notes", "work_date", "deadline_at", "client_approval_status", "client_issues", "notes"].some((field) => errorText.includes(field))
    return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title={migrationMissing ? "Content tracker setup is not complete" : "Content items couldn’t be loaded"} description={migrationMissing ? "Apply the local content workflow alignment migration under supabase/migrations, then refresh this page." : "Refresh the page. No content was changed."} /></main></DashboardShell>
  }

  const campaigns = (campaignResult.data ?? []) as TrackerCampaign[]
  const memberRows = (membersResult.data ?? []) as Array<{ client_id: string; user_id: string }>
  const memberIds = [...new Set(memberRows.map((member) => member.user_id))]
  const { data: memberProfiles, error: memberProfilesError } = memberIds.length
    ? await supabase.from("profiles").select("id,display_name,status,deactivated_at").in("id", memberIds)
    : { data: [], error: null }
  if (memberProfilesError) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Collaborator profiles couldn’t be loaded" description="Refresh the page. Content records have not been changed." /></main></DashboardShell>
  const assigneeById = new Map((memberProfiles ?? []).filter((profile) => profile.status === "active" && !profile.deactivated_at).map((profile) => [profile.id, { id: profile.id, display_name: profile.display_name }]))
  const assignees: Record<string, TrackerAssignee[]> = {}
  for (const member of memberRows) {
    const person = assigneeById.get(member.user_id)
    if (person) assignees[member.client_id] = [...(assignees[member.client_id] ?? []), person]
  }
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const items = ((contentResult.data ?? []) as Omit<TrackerItem, "client_name" | "campaign_name" | "assignee_name">[]).flatMap((item) => {
    const campaign = campaignById.get(item.campaign_id)
    const client = clientById.get(item.client_id)
    const assignee = item.assigned_to ? assigneeById.get(item.assigned_to) : undefined
    return campaign && client ? [{ ...item, client_name: client.name, campaign_name: campaign.name, assignee_name: assignee?.display_name ?? null }] : []
  })

  return <DashboardShell><ContentTracker clients={clients} campaigns={campaigns} assignees={assignees} items={items} canCreate={canCreate} canEdit={canEdit} notice={typeof params.notice === "string" ? params.notice : undefined} importedCount={importedCount} skippedCount={skippedCount} workView={params.view === "work"} /></DashboardShell>
}
