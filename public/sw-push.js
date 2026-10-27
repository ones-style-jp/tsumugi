// つむぎ: 通知だけを扱う Service Worker(2026-10-27)。画面のファイルは扱わない(fetch を横取りしない=更新の仕組みに影響しない)。
//   iOS は通知を受けて表示しないことが続くと登録を消すので、受けたら必ず表示する。
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'つむぎ', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'つむぎ';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: '/preview/tsumugi-favicon-chip-512.png', badge: '/preview/tsumugi-favicon-chip-512.png',
    data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      try { if (new URL(c.url).origin === new URL(url, self.location.origin).origin) { await c.focus(); if ('navigate' in c) await c.navigate(url); return; } } catch {}
    }
    await self.clients.openWindow(url);
  })());
});
