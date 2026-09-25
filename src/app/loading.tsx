import { ContentState } from "@/components/states/content-state"

export default function Loading() {
  return <main className="dashboard-canvas grid min-h-screen place-items-center p-6"><div className="w-full max-w-2xl"><ContentState variant="loading" /></div></main>
}
