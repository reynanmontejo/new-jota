import Link from "next/link"
import { ArrowRight, PlayCircle } from "lucide-react"

const transcript = [
  "Start in Clients. Open your client and check its account manager and video editor.",
  "In Content, choose a campaign or General and Ongoing. Add your title and format, then save. Content describes the post; it does not create a task.",
  "Choose Add task to assign production work. Check the editor and create the task. The designated video editor receives the assignment.",
  "The editor uploads files and submits for review. The supervisor checks the work and approves it for the client.",
  "Send the files to your client outside Jota. Mark them sent, then record the client approval when they reply.",
  "Save the posting schedule. After posting on your usual platform, mark the content Published in Jota.",
]

export function WorkflowTutorial() {
  return <section aria-labelledby="workflow-tutorial-heading" className="mt-5 overflow-hidden rounded-2xl border border-primary/15 bg-card/75">
    <div className="grid items-center lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
      <div className="min-w-0 bg-muted/20">
        <video aria-label="Joyno Task one-minute workflow tutorial" controls playsInline preload="none" width={1920} height={1080} poster="/tutorials/joyno-task-workflow-v3.jpg" className="aspect-video h-auto w-full">
          <source src="/tutorials/joyno-task-workflow-v3.mp4" type="video/mp4" />
          <track src="/tutorials/joyno-task-workflow-v3.en.vtt" kind="captions" srcLang="en" label="English" />
          Your browser cannot play this video. <a href="/tutorials/joyno-task-workflow-v3.mp4">Open the tutorial video</a>, or read the transcript below.
        </video>
      </div>
      <div className="p-4 sm:p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-primary"><PlayCircle aria-hidden="true" className="size-3.5" />1 minute · English narration · Captions</p>
        <h2 id="workflow-tutorial-heading" className="mt-2 text-lg font-semibold tracking-tight">Watch the basic workflow</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Follow one post from client setup and content planning through task assignment, review, client approval, and publishing.</p>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">The video uses sample data and shows the primary-editor path. The written guides also cover backup editors, self-assignment, and reassignment.</p>
        <div className="mt-3 grid gap-2 text-xs font-semibold text-primary">
          <Link href="/help/create-work-from-client-to-task" className="inline-flex items-center gap-1 hover:underline">Read the full workflow<ArrowRight aria-hidden="true" className="size-3" /></Link>
          <Link href="/help/clients-and-campaigns" className="inline-flex items-center gap-1 hover:underline">Set up editors and backups<ArrowRight aria-hidden="true" className="size-3" /></Link>
        </div>
      </div>
    </div>
    <details className="border-t border-border/70 px-4 py-3 sm:px-5">
      <summary className="cursor-pointer text-xs font-semibold text-primary">Read the video transcript</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-5 text-muted-foreground">{transcript.map((paragraph) => <li key={paragraph}>{paragraph}</li>)}</ol>
    </details>
  </section>
}
