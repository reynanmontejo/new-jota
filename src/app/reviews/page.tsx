import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ReviewWorkspace } from "@/features/reviews/review-workspace"

export default function ReviewsPage() {
  return (
    <DashboardShell>
      <ReviewWorkspace />
    </DashboardShell>
  )
}
