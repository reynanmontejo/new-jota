"use client"

import { ContentState } from "@/components/states/content-state"

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="dashboard-canvas grid min-h-screen place-items-center p-6"><div className="w-full max-w-2xl"><ContentState variant="error" actionLabel="Try again" onAction={reset} /></div></main>
}
