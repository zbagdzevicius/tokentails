/*
 * Paw Legends push notifications (docs/plans/moba/SHARE-PUSH.md §2). The game registers this worker after the player
 * turns notifications on; it shows the backend's pushes and opens the game on a tap. It has NO fetch handler: it never
 * touches a page load, a cache or the game build.
 *
 * A push's data (encrypted by the backend for this browser): { t: title, b: body, u: a pawlegends.app path,
 * g: tag (a newer push of the same tag replaces the older one), c: category }.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const PATH = /^\/[A-Za-z0-9/_?=&.-]{0,120}$/;
const str = (v, max, fallback) => (typeof v === "string" && v ? v.slice(0, max) : fallback);

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (_) {
    d = {};
  }
  const path = typeof d.u === "string" && PATH.test(d.u) && !d.u.startsWith("//") ? d.u : "/play";
  const tag = str(d.g, 32, "pawlegends");
  event.waitUntil(
    self.registration.showNotification(str(d.t, 60, "Paw Legends"), {
      body: str(d.b, 140, ""),
      icon: "/apple-touch-icon.png",
      badge: "/favicon-32.png",
      tag,
      renotify: d.c === "invite",
      data: { path },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/play";
  const url = new URL(PATH.test(path) && !path.startsWith("//") ? path : "/play", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // an open game tab comes to the front; otherwise a new one opens
      for (const c of list) {
        const u = new URL(c.url);
        if (u.origin === self.location.origin && u.pathname.startsWith("/play") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
