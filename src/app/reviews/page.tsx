import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ReviewWorkspace } from "@/features/reviews/review-workspace"

export default function ReviewsPage() {
  return (
    <DashboardShell
      navigationVariant="supervisor"
      persona={{ initials: "SC", name: "Sarah Chen", role: "Supervisor" }}
    >
      <ReviewWorkspace />
    </DashboardShell>
  )
}
