import type { NextRequest } from "next/server"

export function isAssistantSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    // Host survives the KVM reverse proxy even when the internal request URL
    // uses HTTP. Browsers cannot override Host independently of the destination.
    return new URL(origin).host === (request.headers.get("host") || request.nextUrl.host)
  } catch { return false }
}
