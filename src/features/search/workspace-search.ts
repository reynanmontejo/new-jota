import type { WorkflowClient, WorkflowTask } from "@/features/workflow/types"

export type WorkspaceSearchResult = {
  type: "Task" | "Client" | "Campaign"
  id: string
  title: string
  detail: string
  href: string
}

function includes(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query)
}

export function searchWorkspace(query: string, tasks: WorkflowTask[], clients: WorkflowClient[], limit = 10): WorkspaceSearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return []

  const taskResults = tasks.filter((task) => includes(`${task.title} ${task.clientName} ${task.campaign}`, normalizedQuery))
    .map((task) => ({ type: "Task" as const, id: task.id, title: task.title, detail: `${task.clientName} · ${task.campaign}`, href: `/tasks/${encodeURIComponent(task.id)}` }))
  const clientResults = clients.filter((client) => includes(client.name, normalizedQuery))
    .map((client) => ({ type: "Client" as const, id: client.id, title: client.name, detail: "Client workspace", href: `/clients/${encodeURIComponent(client.id)}` }))
  const campaignResults = clients.flatMap((client) => (client.campaigns ?? [])
    .filter((campaign) => includes(`${campaign.name} ${client.name}`, normalizedQuery))
    .map((campaign) => ({ type: "Campaign" as const, id: campaign.id, title: campaign.name, detail: client.name, href: `/clients/${encodeURIComponent(client.id)}?tab=campaigns` })))

  return [...taskResults, ...clientResults, ...campaignResults].slice(0, Math.max(1, limit))
}
