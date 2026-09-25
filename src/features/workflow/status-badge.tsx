import { Badge } from "@/components/ui/badge"
import type { TaskStatus } from "@/features/workflow/types"
import { cn } from "@/lib/utils"

const labels: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  for_review: "For review",
  revision_requested: "Revision requested",
  approved: "Approved",
  completed: "Completed",
  cancelled: "Cancelled",
}

const tones: Record<TaskStatus, string> = {
  todo: "bg-background/75 text-muted-foreground",
  in_progress: "border-primary/25 bg-primary/12 text-primary",
  for_review: "border-accent/30 bg-accent/18 text-[#765126] dark:text-accent",
  revision_requested: "border-[#9a6242]/25 bg-[#9a6242]/10 text-[#7f5136] dark:text-secondary",
  approved: "border-emerald-600/25 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  completed: "border-emerald-600/25 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground",
}

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <Badge variant="outline" className={cn("text-[10px] font-semibold", tones[status], className)}>{labels[status]}</Badge>
}

export function getStatusLabel(status: TaskStatus) {
  return labels[status]
}
