// TOMO 서비스워커 — 웹푸시 수신·클릭만 담당 (오프라인 캐시 없음)
self.addEventListener("push", (event) => {
  let data = { title: "TOMO", body: "", url: "/chat", tag: "tomo" };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, tag: data.tag, icon: "/icon-192.png", badge: "/icon-192.png",
    data: { url: data.url }, renotify: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
