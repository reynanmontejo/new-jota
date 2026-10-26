"use client"

import { useEffect, type ReactNode } from "react"

import { WorkspacePageSkeleton } from "@/components/states/workspace-page-skeleton"
import { useWorkflow } from "@/features/workflow/workflow-provider"

export function WorkflowDataGate({ children }: { children: ReactNode }) {
  const { workflowDataReady, workflowDataLoading, ensureWorkflowData, error } = useWorkflow()

  useEffect(() => {
    if (!workflowDataReady) void ensureWorkflowData()
  }, [workflowDataReady, ensureWorkflowData])

  if (workflowDataReady) return children
  if (workflowDataLoading || !error) return <WorkspacePageSkeleton />

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <p role="alert" className="text-sm text-destructive">{error}</p>
      <button type="button" className="mt-3 text-sm font-medium text-primary underline" onClick={() => void ensureWorkflowData()}>Retry loading workspace</button>
    </main>
  )
}
