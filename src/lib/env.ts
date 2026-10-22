import { z } from "zod"

const publicSupabaseEnvSchema = z.object({
  url: z.string().url(),
  publishableKey: z.string().min(1),
})

const serverSupabaseEnvSchema = publicSupabaseEnvSchema.extend({
  serviceRoleKey: z.string().min(1),
})

export function getPublicSupabaseEnv() {
  return publicSupabaseEnvSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
}

export function getServerSupabaseEnv() {
  return serverSupabaseEnvSchema.parse({
    ...getPublicSupabaseEnv(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
}

/** True only when a real project URL/key are supplied (not .env.example placeholders). */
export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const isAllowedUrl = (() => {
    if (!url) return false

    try {
      const parsedUrl = new URL(url)
      return (
        parsedUrl.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" &&
          parsedUrl.protocol === "http:" &&
          ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsedUrl.hostname))
      )
    } catch {
      return false
    }
  })()

  return Boolean(
    url &&
      isAllowedUrl &&
      publishableKey &&
      !url.includes("your-project") &&
      !publishableKey.includes("your-publishable-key"),
  )
}
