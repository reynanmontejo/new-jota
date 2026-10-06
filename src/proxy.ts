import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/env"

function copyCookies(source: NextResponse, destination: NextResponse) {
  source.cookies.getAll().forEach((cookie) => destination.cookies.set(cookie))
  return destination
}

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Authentication is not configured.", { status: 503 })
    }
    return NextResponse.next()
  }

  const { url, publishableKey } = getPublicSupabaseEnv()
  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: auth, error: authError } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  const pathname = request.nextUrl.pathname
  const isPublicRoute = pathname === "/login" || pathname === "/auth/callback" || pathname === "/account-deactivated" || pathname === "/access-denied"

  if (pathname === "/auth/callback") return response

  if (authError || typeof userId !== "string") {
    if (isPublicRoute) return response
    const login = request.nextUrl.clone()
    login.pathname = "/login"
    login.search = ""
    login.searchParams.set("next", pathname + request.nextUrl.search)
    return copyCookies(response, NextResponse.redirect(login))
  }

  // A signed-in user without a profile may access only the one-time bootstrap.
  // The database RPC independently enforces that no organization/profile exists.
  if (pathname === "/setup") return response

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id, status, deactivated_at")
    .eq("id", userId)
    .maybeSingle()

  if (profile && (profile.status === "inactive" || profile.deactivated_at)) {
    if (pathname === "/account-deactivated") return response
    const target = request.nextUrl.clone()
    target.pathname = "/account-deactivated"
    target.search = ""
    return copyCookies(response, NextResponse.redirect(target))
  }

  if (!profile && !profileError) {
    const setup = request.nextUrl.clone()
    setup.pathname = "/setup"
    setup.search = ""
    return copyCookies(response, NextResponse.redirect(setup))
  }
  if (profileError || !profile || profile.status !== "active") {
    if (pathname === "/access-denied") return response
    const target = request.nextUrl.clone()
    target.pathname = "/access-denied"
    target.search = ""
    return copyCookies(response, NextResponse.redirect(target))
  }

  // Keep role resolution as explicit organization-scoped reads. Nested PostgREST
  // joins can fail under RLS even when the user's own membership is readable,
  // which otherwise sends valid users to access-denied on every route.
  const { data: memberships, error: membershipsError } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("organization_id", profile.organization_id)
    .eq("user_id", userId)
  const roleIds = memberships?.map(({ role_id }) => role_id) ?? []
  const { data: roles, error: rolesError } = roleIds.length
    ? await supabase
        .from("roles")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .in("id", roleIds)
    : { data: [], error: null }

  if (membershipsError || rolesError || !roles?.length) {
    if (pathname === "/access-denied") return response
    const target = request.nextUrl.clone()
    target.pathname = "/access-denied"
    target.search = ""
    return copyCookies(response, NextResponse.redirect(target))
  }

  // A user who signs in from an access-denied screen may carry that URL as
  // the post-login destination. Once role checks pass, send them to the app.
  if (pathname === "/login" || pathname === "/access-denied") {
    const target = request.nextUrl.clone()
    target.pathname = "/"
    target.search = ""
    return copyCookies(response, NextResponse.redirect(target))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
