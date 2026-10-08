/* Jota web-push service worker. Keep notification content concise and links same-origin. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() ?? "" }; }
  const title = typeof payload.title === "string" ? payload.title : "Jota notification";
  const body = typeof payload.body === "string" ? payload.body : "You have a new workspace update.";
  const id = typeof payload.id === "string" ? payload.id : "jota-update";
  const path = typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//") ? payload.url : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: id,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { path },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = typeof event.notification.data?.path === "string" && event.notification.data.path.startsWith("/") && !event.notification.data.path.startsWith("//")
    ? event.notification.data.path
    : "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const sameOrigin = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (sameOrigin && "focus" in sameOrigin) {
      sameOrigin.navigate(target);
      return sameOrigin.focus();
    }
    return self.clients.openWindow(target);
  }));
});
