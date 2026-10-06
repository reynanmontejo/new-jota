export const employeeStatuses = ["invited", "active", "inactive"] as const
export const clientStatuses = ["active", "paused", "archived"] as const
export const campaignStatuses = ["draft", "active", "paused", "completed", "cancelled"] as const
export const contentStatuses = ["idea", "planned", "in_production", "for_review", "revision_requested", "waiting_client", "scheduled", "published", "rejected", "cancelled"] as const
export const taskStatuses = ["todo", "in_progress", "for_review", "revision_requested", "approved", "completed", "cancelled"] as const
export const taskPriorities = ["low", "medium", "high", "urgent"] as const
export const submissionStatuses = ["draft", "submitted", "revision_requested", "approved"] as const
export const reviewDecisions = ["approved", "revision_requested"] as const

export type EmployeeStatus = (typeof employeeStatuses)[number]
export type ClientStatus = (typeof clientStatuses)[number]
export type CampaignStatus = (typeof campaignStatuses)[number]
export type ContentStatus = (typeof contentStatuses)[number]
export type TaskStatus = (typeof taskStatuses)[number]
export type TaskPriority = (typeof taskPriorities)[number]
export type SubmissionStatus = (typeof submissionStatuses)[number]
export type ReviewDecision = (typeof reviewDecisions)[number]

export type Permission =
  | "clients.view_assigned"
  | "clients.view_all"
  | "clients.manage"
  | "campaigns.create"
  | "campaigns.update"
  | "campaigns.delete"
  | "content.create"
  | "content.update"
  | "tasks.create"
  | "tasks.update"
  | "tasks.assign"
  | "tasks.review"
  | "tasks.approve"
  | "employees.view"
  | "employees.create"
  | "employees.update"
  | "employees.deactivate"
  | "teams.manage"
  | "tools.manage"
  | "storage.manage"
  | "settings.manage"
