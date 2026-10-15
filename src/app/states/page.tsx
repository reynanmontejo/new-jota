import { DashboardShell } from "@/components/layout/dashboard-shell"
import { StateGallery } from "@/features/states/state-gallery"
import { notFound } from "next/navigation"

export default function StatesPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <DashboardShell><StateGallery /></DashboardShell>
}
