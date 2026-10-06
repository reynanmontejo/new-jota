import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ContentState } from "@/components/states/content-state"
import { ClientDirectory, type ClientDirectoryItem } from "@/features/clients/client-directory"
import { initialWorkflowState } from "@/features/workflow/mock-data"
import { isSupabaseConfigured } from "@/lib/env"
import { getClientLifecyclePermissions, getClientManagementContext } from "@/lib/supabase/client-admin"
import { createClient } from "@/lib/supabase/server"

type ClientRow = Omit<ClientDirectoryItem, "campaignCount" | "openTaskCount" | "primaryAccountManager">
type TrashedClient = { id: string; name: string; description: string | null; status: "active" | "paused" | "archived"; deleted_at: string }
type RecentClientFile = { id: string; clientId: string; clientName: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; taskId: string | null }

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[]; tab?: string; view?: string }> }) {
  const params = await searchParams
  const initialTab = params.tab === "campaigns" || params.tab === "files" ? params.tab : "overview"
  const configured = isSupabaseConfigured()
  const [managementContext, lifecyclePermissions] = configured
    ? await Promise.all([getClientManagementContext(), getClientLifecyclePermissions()])
    : [null, null]
  const canCreate = Boolean(managementContext)
  const canManageTrash = Boolean(lifecyclePermissions?.canManageTrash)
  const initialView = canManageTrash && params.view === "trash" ? "trash" : "active"
  let clients: ClientDirectoryItem[]
  let trashedClients: TrashedClient[] = []
  let recentFiles: RecentClientFile[] = []

  if (!configured) {
    const demoClients = new Map<string, { name: string; campaigns: Set<string>; tasks: number }>()
    for (const task of initialWorkflowState.tasks) {
      const entry = demoClients.get(task.clientId) ?? { name: task.clientName, campaigns: new Set<string>(), tasks: 0 }
      entry.campaigns.add(task.campaign)
      entry.tasks += Number(!["approved", "completed", "cancelled"].includes(task.status))
      demoClients.set(task.clientId, entry)
    }
    clients = [...demoClients].map(([id, client]) => ({
      id,
      name: client.name,
      description: null,
      website_url: null,
      social_platforms: [],
      status: "active" as const,
        campaignCount: client.campaigns.size,
        openTaskCount: client.tasks,
      primaryAccountManager: null,
      accountManagers: [],
    })).sort((a, b) => a.name.localeCompare(b.name))
  } else {
    const supabase = await createClient()
    if (initialView === "trash") {
      const { data, error: trashError } = await supabase.from("clients")
        .select("id,name,description,status,deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
      if (trashError) {
        return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Client Trash couldn’t be loaded" description="Refresh and try again. Client records have not been changed." /></main></DashboardShell>
      }
      trashedClients = (data ?? []) as TrashedClient[]
    }
    const { data: clientRows, error } = await supabase.from("clients")
      .select("id, name, description, website_url, social_platforms, status")
      .is("deleted_at", null)
      .order("name")

    if (error) {
      return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Clients couldn’t be loaded" description="Refresh and try again. Your client records have not been changed." /></main></DashboardShell>
    }

    const rows = (clientRows ?? []) as ClientRow[]
    const clientIds = rows.map(({ id }) => id)
    const [campaignResult, taskResult, membershipResult, recentFileResult] = await Promise.all([
      clientIds.length ? supabase.from("campaigns").select("id, client_id").is("deleted_at", null).in("client_id", clientIds) : Promise.resolve({ data: [], error: null }),
      clientIds.length ? supabase.from("tasks").select("id, client_id, status").is("deleted_at", null).in("client_id", clientIds) : Promise.resolve({ data: [], error: null }),
      clientIds.length ? supabase.from("client_members").select("client_id,user_id,is_primary").eq("client_role", "account_manager").is("removed_at", null).in("client_id", clientIds) : Promise.resolve({ data: [], error: null }),
      initialTab === "files" && initialView === "active"
        ? supabase.from("attachments").select("id,client_id,file_name,mime_type,size_bytes,created_at,task_id").is("deleted_at", null).order("created_at", { ascending: false }).limit(8)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (campaignResult.error || taskResult.error || membershipResult.error || recentFileResult.error) {
      return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Client summaries couldn’t be loaded" description="Refresh and try again. Your client records have not been changed." /></main></DashboardShell>
    }

    const managerMemberships = membershipResult.data ?? []
    const managerIds = [...new Set(managerMemberships.map((member) => member.user_id))]
    const managerProfiles = managerIds.length
      ? await supabase.from("profiles").select("id,display_name").in("id", managerIds)
      : { data: [], error: null }
    if (managerProfiles.error) {
      return <DashboardShell><main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="error" title="Account manager names couldn’t be loaded" description="Refresh and try again. Your client records have not been changed." /></main></DashboardShell>
    }
    const managerNames = new Map((managerProfiles.data ?? []).map((profile) => [profile.id, profile.display_name]))

    clients = rows.map((client) => ({
      ...client,
      campaignCount: campaignResult.data?.filter((campaign) => campaign.client_id === client.id).length ?? 0,
      openTaskCount: taskResult.data?.filter((task) => task.client_id === client.id && !["approved", "completed", "cancelled"].includes(task.status)).length ?? 0,
      primaryAccountManager: (() => {
        const owner = managerMemberships.find((member) => member.client_id === client.id && member.is_primary)
        const name = owner ? managerNames.get(owner.user_id) : undefined
        return owner && name ? { id: owner.user_id, name } : null
      })(),
      accountManagers: managerMemberships.filter((member) => member.client_id === client.id)
        .flatMap((member) => {
          const name = managerNames.get(member.user_id)
          return name ? [{ id: member.user_id, name, isPrimary: member.is_primary }] : []
        }),
    }))
    const clientNames = new Map(rows.map((client) => [client.id, client.name]))
    recentFiles = ((recentFileResult.data ?? []) as unknown as { id: string; client_id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string; task_id: string | null }[])
      .flatMap((file) => {
        const clientName = clientNames.get(file.client_id)
        return [{ id: file.id, clientId: file.client_id, clientName: clientName ?? "Accessible task", canBrowseClient: Boolean(clientName), fileName: file.file_name, mimeType: file.mime_type, sizeBytes: file.size_bytes, createdAt: file.created_at, taskId: file.task_id }]
      })
  }

  return <DashboardShell><ClientDirectory clients={clients} recentFiles={recentFiles} trashedClients={trashedClients} canManageTrash={canManageTrash} canCreate={canCreate} notice={typeof params.notice === "string" ? params.notice : undefined} initialTab={initialTab} initialView={initialView} /></DashboardShell>
}
