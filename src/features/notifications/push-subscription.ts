export function toApplicationServerKey(base64Url: string) {
  const normalized = base64Url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4)
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

export function subscriptionMatchesKey(subscription: PushSubscription, publicKey: string) {
  const currentKey = subscription.options.applicationServerKey
  if (!currentKey) return false
  try {
    const expected = toApplicationServerKey(publicKey)
    const actual = new Uint8Array(currentKey)
    return actual.length === expected.length && actual.every((value, index) => value === expected[index])
  } catch {
    return false
  }
}

// Run only after an explicit opt-in and granted browser permission.
export async function enablePushSubscription(
  manager: PushManager,
  publicKey: string,
  remove: (endpoint: string) => Promise<void>,
  save: (subscription: PushSubscription) => Promise<void>,
) {
  let subscription = await manager.getSubscription()
  if (subscription && !subscriptionMatchesKey(subscription, publicKey)) {
    // Remove server state first so a failed unsubscribe can retry scoped cleanup.
    await remove(subscription.endpoint)
    if (!await subscription.unsubscribe()) {
      throw new Error("The previous browser subscription could not be disconnected. Try reconnecting again.")
    }
    subscription = null
  }
  const created = !subscription
  subscription ??= await manager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toApplicationServerKey(publicKey),
  })
  try {
    await save(subscription)
  } catch (error) {
    // A local subscription alone does not mean the server can deliver to it.
    if (created) await subscription.unsubscribe().catch(() => false)
    throw error
  }
}
