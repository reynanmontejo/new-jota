import Link from "next/link"
import { BrandLogo } from "@/components/brand-logo"

import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { isSupabaseConfigured } from "@/lib/env"
import { signIn } from "@/app/auth/actions"
import { SignInSubmitButton } from "./submit-button"

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
        <div className="mb-6 flex justify-center">
          <BrandLogo showParentBrand className="w-56 max-w-full" />
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
            <div className="space-y-1.5 text-xs font-medium">
              <label htmlFor="login-password" className="block">Password</label>
              <PasswordInput id="login-password" name="password" autoComplete="current-password" required className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <SignInSubmitButton />
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
