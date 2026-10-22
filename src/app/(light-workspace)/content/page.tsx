import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ContentState } from "@/components/states/content-state"
import { ContentTracker, type TrackerAssignee, type TrackerCampaign, type TrackerClient, type TrackerItem } from "@/features/content/content-tracker"
import { isSupabaseConfigured } from "@/lib/env"
import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"
import { redirect } from "next/navigation"

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[]; added?: string; duplicates?: string; view?: string }> }) {
  const params = await searchParams
  const isArchivedView = params.view === "archived"
  const importedCount = params.added && /^\d+$/.test(params.added) ? Number(params.added) : undefined
  const skippedCount = params.duplicates && /^\d+$/.test(params.duplicates) ? Number(params.duplicates) : undefined
  if (!isSupabaseConfigured()) {
    return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Connect the workspace database to use the content tracker" description="The tracker stores client content and publishing dates in Supabase. Configure the project environment, then reload." /></main></DashboardShell>
  }

  const context = await getWorkspaceRequestContext()
  if (!context) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="access_denied" title="Workspace access is unavailable" description="An active workspace profile is required to access tracked content." /></main></DashboardShell>
  const { supabase } = context
  const canAssignContent = context.roles.some((role) => ["supervisor", "administrator"].includes(role.code))

  const { data: permissions, error: permissionError } = await supabase.from("role_permissions").select("permission_code").eq("organization_id", context.organizationId).in("role_id", context.roleIds).in("permission_code", ["content.create", "content.update", "tasks.create"])
  if (permissionError) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Content permissions couldn’t be loaded" description="Refresh the page. No content was changed." /></main></DashboardShell>
  const canCreate = Boolean(permissions?.some((permission) => permission.permission_code === "content.create"))
  const canEdit = Boolean(permissions?.some((permission) => permission.permission_code === "content.update"))
  const canCreateTask = Boolean(permissions?.some((permission) => permission.permission_code === "tasks.create"))
  if (isArchivedView && !canEdit) redirect("/access-denied")

  const { data: clientsData, error: clientsError } = await supabase.from("clients").select("id,name").is("deleted_at", null).order("name")
  if (clientsError) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Clients couldn’t be loaded for the tracker" description="Check your client access, then refresh. No records were changed." /></main></DashboardShell>
  const clients = (clientsData ?? []) as TrackerClient[]
  const clientIds = clients.map((client) => client.id)
  let contentQuery = supabase.from("content_items").select("id,client_id,campaign_id,title,platform,content_type,description,status,work_date,deadline_at,publish_at,client_approval_status,client_issues,client_handoff_version_id,client_sent_at,notes,revision_count,revision_notes,next_action,assigned_to").in("client_id", clientIds).order("publish_at", { ascending: true, nullsFirst: false })
  contentQuery = isArchivedView ? contentQuery.not("deleted_at", "is", null) : contentQuery.is("deleted_at", null)
  const [campaignResult, contentResult, membersResult] = clientIds.length ? await Promise.all([
    supabase.from("campaigns").select("id,client_id,name,status").is("deleted_at", null).in("client_id", clientIds).order("name"),
    contentQuery,
    supabase.from("client_members").select("client_id,user_id,client_role").is("removed_at", null).in("client_id", clientIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]

  if (campaignResult.error) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Campaigns couldn’t be loaded" description="Refresh the page. Your client and campaign records have not been changed." /></main></DashboardShell>
  if (membersResult.error) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Client collaborators couldn’t be loaded" description="Refresh the page. Content records have not been changed." /></main></DashboardShell>
  if (contentResult.error) {
    const errorText = contentResult.error.message.toLowerCase()
    const migrationMissing = ["revision_count", "next_action", "assigned_to", "revision_notes", "work_date", "deadline_at", "client_approval_status", "client_issues", "client_handoff_version_id", "client_sent_at", "notes"].some((field) => errorText.includes(field))
    return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title={migrationMissing ? "Content tracker setup is not complete" : "Content items couldn’t be loaded"} description={migrationMissing ? "Apply pending content migrations under supabase/migrations, then refresh this page." : "Refresh the page. No content was changed."} /></main></DashboardShell>
  }

  const campaigns = (campaignResult.data ?? []) as TrackerCampaign[]
  const memberRows = (membersResult.data ?? []) as Array<{ client_id: string; user_id: string; client_role: string }>
  const accountManagerClientIds = memberRows.filter((member) => member.user_id === context.userId && member.client_role === "account_manager").map((member) => member.client_id)
  const contentIds = (contentResult.data ?? []).map((item) => item.id)
  const { data: submissionRows, error: submissionError } = !isArchivedView && contentIds.length
    ? await supabase.from("content_submissions").select("id,content_item_id,status,current_version_number,content_submission_versions(id,version_number)").in("content_item_id", contentIds).eq("status", "approved")
    : { data: [], error: null }
  if (submissionError) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Content review state couldn’t be loaded" description="Refresh the page. No records were changed." /></main></DashboardShell>
  const approvedVersionByContent = new Map((submissionRows ?? []).flatMap((submission) => {
    const latest = submission.content_submission_versions?.find((version) => version.version_number === submission.current_version_number)
    return latest ? [[submission.content_item_id, latest.id] as const] : []
  }))
  const memberIds = [...new Set(memberRows.map((member) => member.user_id))]
  const { data: memberProfiles, error: memberProfilesError } = memberIds.length
    ? await supabase.from("profiles").select("id,display_name,status,deactivated_at").in("id", memberIds)
    : { data: [], error: null }
  if (memberProfilesError) return <DashboardShell><main className="mx-auto max-w-6xl px-4 py-6"><ContentState variant="error" title="Collaborator profiles couldn’t be loaded" description="Refresh the page. Content records have not been changed." /></main></DashboardShell>
  const assigneeById = new Map((memberProfiles ?? []).filter((profile) => profile.status === "active" && !profile.deactivated_at).map((profile) => [profile.id, { id: profile.id, display_name: profile.display_name }]))
  const assignees: Record<string, TrackerAssignee[]> = {}
  const videoEditorByClient: Record<string, string> = {}
  for (const member of memberRows) {
    const person = assigneeById.get(member.user_id)
    if (!person) continue
    if (!(assignees[member.client_id] ?? []).some((assignee) => assignee.id === person.id)) {
      assignees[member.client_id] = [...(assignees[member.client_id] ?? []), person]
    }
    if (member.client_role === "video_editor") videoEditorByClient[member.client_id] = person.id
  }
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const items = ((contentResult.data ?? []) as Omit<TrackerItem, "client_name" | "campaign_name" | "assignee_name">[]).flatMap((item) => {
    const campaign = campaignById.get(item.campaign_id)
    const client = clientById.get(item.client_id)
    const assignee = item.assigned_to ? assigneeById.get(item.assigned_to) : undefined
    return campaign && client ? [{ ...item, client_name: client.name, campaign_name: campaign.name, assignee_name: assignee?.display_name ?? null, latest_approved_version_id: approvedVersionByContent.get(item.id) ?? null }] : []
  })

  return <DashboardShell><ContentTracker clients={clients} campaigns={campaigns} assignees={assignees} videoEditorByClient={videoEditorByClient} accountManagerClientIds={accountManagerClientIds} items={items} canCreate={canCreate} canEdit={canEdit} canCreateTask={canCreateTask} currentUserId={context.userId} canAssignContent={canAssignContent} notice={typeof params.notice === "string" ? params.notice : undefined} importedCount={importedCount} skippedCount={skippedCount} isArchivedView={isArchivedView} /></DashboardShell>
}
