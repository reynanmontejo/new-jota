export type TaskStatus =
  | "todo"
  | "in_progress"
  | "for_review"
  | "revision_requested"
  | "approved"
  | "completed"
  | "cancelled"

export type SubmissionVersionStatus = "draft" | "submitted" | "revision_requested" | "approved"

export type WorkflowFile = {
  id: string
  name: string
  size: number
  type: string
}

export type WorkflowVersion = {
  id: string
  number: number
  status: SubmissionVersionStatus
  notes: string
  submittedBy: string
  submittedById: string
  submittedAt: string | null
  files: WorkflowFile[]
  reviewComment?: string
  reviewedBy?: string
  reviewedAt?: string
}

export type WorkflowTask = {
  id: string
  title: string
  description: string
  clientId: string
  clientName: string
  campaign: string
  contentItem: string
  priority: "low" | "medium" | "high" | "urgent"
  status: TaskStatus
  startDate: string
  dueDate: string
  /** Canonical timestamp for filtering/sorting. Keep dueDate for display compatibility. */
  dueAt?: string | null
  primaryOwner: { id: string; name: string; initials: string; role: string }
  collaborators: Array<{ id: string; name: string; initials: string; role: string }>
  checklist: Array<{ id: string; label: string; completed: boolean }>
  comments: Array<{ id: string; author: string; initials: string; body: string; createdAt: string }>
  versions: WorkflowVersion[]
  activity: Array<{ id: string; label: string; actor: string; createdAt: string }>
}

export type WorkflowState = {
  tasks: WorkflowTask[]
}

export type WorkflowClient = {
  id: string
  name: string
  campaigns?: Array<{ id: string; name: string }>
}

export type WorkflowUpcomingContent = {
  id: string
  title: string
  clientId: string
  clientName: string
  platform: string
  publishAt: string
}
