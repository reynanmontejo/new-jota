"use client"

import { useState } from "react"

import { ContentState, UploadProgress } from "@/components/states/content-state"
import { cn } from "@/lib/utils"

const states = ["loading", "empty", "error", "access_denied", "deactivated", "upload"] as const
type StateName = (typeof states)[number]

export function StateGallery() {
  const [active, setActive] = useState<StateName>("loading")

  return <main className="mx-auto max-w-[1050px] px-4 py-6 sm:px-6 lg:px-8"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Shared components</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Interface states</h1><p className="mt-1 text-sm text-muted-foreground">Consistent feedback for every stage of the workflow.</p><div className="mt-5 flex flex-wrap gap-2">{states.map((state) => <button key={state} onClick={() => setActive(state)} className={cn("rounded-xl px-3 py-2 text-xs font-semibold capitalize transition", active === state ? "bg-primary text-primary-foreground" : "border border-primary/15 bg-background/55 text-muted-foreground hover:text-foreground")}>{state.replace("_", " ")}</button>)}</div><div className="mt-4">{active === "upload" ? <div className="glass-panel rounded-2xl border p-6"><h2 className="font-semibold">Upload states</h2><div className="mt-5 space-y-3"><UploadProgress fileName="campaign-deliverable-v2.pdf" progress={62} status="uploading" /><UploadProgress fileName="approved-carousel.pdf" progress={100} status="complete" /><UploadProgress fileName="raw-video-export.mov" progress={34} status="error" onRetry={() => undefined} /></div></div> : <ContentState variant={active} actionLabel={active === "error" ? "Try again" : undefined} onAction={active === "error" ? () => setActive("loading") : undefined} />}</div></main>
}
