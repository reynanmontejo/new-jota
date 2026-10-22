"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { canViewTask } from "@/features/workflow/task-permissions"
import { useWorkflow } from "@/features/workflow/workflow-provider"

const TaskDetail = dynamic(() => import("@/features/tasks/task-detail").then((module) => module.TaskDetail), {
  loading: () => <div role="status" className="p-5 text-sm text-muted-foreground">Loading task…</div>,
})

export type ContentTaskSeed = {
  contentItemId: string
  contentItemTitle: string
  title: string
  clientId: string
  clientName: string
  campaignName: string
  deadlineAt: string | null
  assigneeId?: string | null
}

type TaskDrawerContextValue = {
  openTask: (taskId: string) => void
  openNewTask: (seed?: ContentTaskSeed) => void
  newTaskOpen: boolean
  newTaskSeed: ContentTaskSeed | null
  closeNewTask: () => void
}

const TaskDrawerContext = createContext<TaskDrawerContextValue | null>(null)

export function TaskDrawerProvider({ children }: { children: ReactNode }) {
  const [taskId, setTaskId] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newTaskSeed, setNewTaskSeed] = useState<ContentTaskSeed | null>(null)
  const { tasks, currentUser } = useWorkflow()
  const task = tasks.find((item) => item.id === taskId)
  const openTask = (id: string) => {
    const requestedTask = tasks.find((item) => item.id === id)
    if (requestedTask && canViewTask(requestedTask, currentUser)) setTaskId(id)
  }
  const openNewTask = (seed?: ContentTaskSeed) => {
    setNewTaskSeed(seed ?? null)
    setNewTaskOpen(true)
  }
  const closeNewTask = () => {
    setNewTaskOpen(false)
    setNewTaskSeed(null)
  }

  return (
    <TaskDrawerContext.Provider value={{ openTask, openNewTask, newTaskOpen, newTaskSeed, closeNewTask }}>
      {children}
      <Sheet open={taskId !== null} onOpenChange={(open) => { if (!open) setTaskId(null) }}>
        <SheetContent className="!w-[92vw] gap-0 overflow-y-auto p-0 sm:!w-[min(50vw,720px)] sm:!max-w-[720px]">
          <SheetHeader className="sr-only">
            <SheetTitle>{task?.title ?? "Task details"}</SheetTitle>
            <SheetDescription>Task details and work submission</SheetDescription>
          </SheetHeader>
          {taskId && <TaskDetail taskId={taskId} embedded />}
        </SheetContent>
      </Sheet>
    </TaskDrawerContext.Provider>
  )
}

export function useTaskDrawer() {
  const context = useContext(TaskDrawerContext)
  if (!context) throw new Error("useTaskDrawer must be used within TaskDrawerProvider")
  return context
}
