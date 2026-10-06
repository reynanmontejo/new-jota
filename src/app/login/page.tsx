import Link from "next/link"

import { Button } from "@/components/ui/button"
import { isSupabaseConfigured } from "@/lib/env"
import { signIn } from "@/app/auth/actions"

const errorMessages: Record<string, string> = {
  invalid: "Email or password is incorrect, or this account is not active.",
  setup: "Sign-in is not configured yet. Use the local demo while Supabase is unconfigured.",
  callback: "The sign-in link could not be verified. Please try again.",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams
  const configured = isSupabaseConfigured()

  return (
    <main className="dashboard-canvas grid min-h-screen place-items-center p-5">
      <section className="w-full max-w-sm border border-border bg-card p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">J</span>
          <div>
            <p className="text-sm font-semibold">Jota</p>
            <p className="text-[11px] text-muted-foreground">Joyno Task</p>
          </div>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your company account to continue.</p>

        {error && <p role="alert" className="mt-4 border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">{errorMessages[error] ?? errorMessages.invalid}</p>}

        {configured ? (
          <form action={signIn} className="mt-5 space-y-3">
            <input type="hidden" name="next" value={next ?? "/"} />
            <label className="block space-y-1.5 text-xs font-medium">
              <span>Work email</span>
              <input name="email" type="email" autoComplete="username" required className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
            <Button type="submit" className="h-10 w-full rounded-md">Continue</Button>
          </form>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="border border-border bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">Supabase credentials are not configured. The app remains in demo mode for local testing.</p>
            <Button render={<Link href="/" />} className="h-10 w-full rounded-md">Continue to demo</Button>
          </div>
        )}
      </section>
    </main>
  )
}
