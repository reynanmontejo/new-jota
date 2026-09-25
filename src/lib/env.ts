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
