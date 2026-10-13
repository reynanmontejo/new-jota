"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { trashTaskAction } from "@/app/tasks/actions"

export function TaskTrashButton({ taskId }: { taskId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function moveToTrash() {
    setError(null)
    startTransition(async () => {
      const result = await trashTaskAction(taskId)
      if (result.error) {
        setError(result.error.includes("work history or files")
          ? "The database still blocks tasks with files or history. Apply migration 202610240001_allow_task_trash_with_history.sql in Supabase, then try again."
          : result.error.includes("review or approval")
            ? "Resolve its review first; tasks awaiting review or approval must remain on the active board."
            : "You do not have permission to move this task to Trash.")
        return
      }
      router.push("/tasks/trash?notice=trashed")
      router.refresh()
    })
  }

  return <div>
    {!confirming && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => { setError(null); setConfirming(true) }} className="text-destructive hover:text-destructive">
      <Trash2 data-icon="inline-start" />Move task to Trash
    </Button>}
    {confirming && <section aria-label="Confirm moving task to Trash" className="mt-2 max-w-lg rounded-xl border border-destructive/25 bg-destructive/5 p-3">
      <p className="text-xs font-semibold">Move this task to Trash?</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">It will leave active task lists, but its files and review history will be kept. You can restore it later.</p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(false)}>Keep task</Button>
        <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={moveToTrash}>
          <Trash2 data-icon="inline-start" />{pending ? "Moving..." : "Confirm move"}
        </Button>
      </div>
    </section>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>
}
