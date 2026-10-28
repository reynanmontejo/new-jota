export type DeadlineUrgency = "overdue" | "soon" | "upcoming"

export const deadlineStyles: Record<DeadlineUrgency, { label: string; legendLabel: string; className: string; dateClassName: string; dotClassName: string }> = {
  overdue: { label: "Past due", legendLabel: "Past due", className: "border-rose-500/25 bg-rose-500/12 text-rose-900 dark:text-rose-200", dateClassName: "bg-rose-500/15 text-rose-900 dark:text-rose-200", dotClassName: "bg-rose-500" },
  soon: { label: "Due soon", legendLabel: "Due within 3 days", className: "border-amber-500/25 bg-amber-500/14 text-amber-900 dark:text-amber-200", dateClassName: "bg-amber-500/15 text-amber-900 dark:text-amber-200", dotClassName: "bg-amber-500" },
  upcoming: { label: "Upcoming", legendLabel: "Later deadline", className: "border-emerald-600/20 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200", dateClassName: "bg-emerald-600/12 text-emerald-900 dark:text-emerald-200", dotClassName: "bg-emerald-600" },
}

export function getDeadlineUrgencyForDays(daysUntilDue: number): DeadlineUrgency {
  if (daysUntilDue < 0) return "overdue"
  return daysUntilDue <= 3 ? "soon" : "upcoming"
}
