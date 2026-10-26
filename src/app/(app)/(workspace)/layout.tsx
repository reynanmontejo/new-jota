import type { ReactNode } from "react"

import { WorkflowDataGate } from "@/features/workflow/workflow-data-gate"

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkflowDataGate>{children}</WorkflowDataGate>
}
