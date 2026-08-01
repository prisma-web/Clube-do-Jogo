const CACHE_NAME = 'clube-do-jogo-v5';
const APP_SHELL = ['/jogo-do-mes', '/ranking', '/jogos', '/seus-jogos', '/perfil', '/configuracoes', '/manifest.webmanifest', '/icons/club-do-jogo-192.png', '/icons/club-do-jogo-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then(cached => {
        const update = fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        });
        if (cached) {
          event.waitUntil(update.catch(() => undefined));
          return cached;
        }
        return update.catch(async () => (await caches.match('/jogo-do-mes')));
      }),
    );
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'Clube do Jogo';
  const options = {
    body: payload.body || 'Ha uma novidade no clube.',
    icon: '/icons/club-do-jogo-192.png',
    badge: '/icons/club-do-jogo-192.png',
    tag: payload.tag || 'clube-do-jogo',
    renotify: true,
    data: { url: payload.url || '/jogo-do-mes?section=timeline' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/jogo-do-mes?section=timeline', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const openClient = clientList.find(client => 'focus' in client);
      if (openClient) {
        const focused = openClient.focus();
        // Só navega se a aba não estiver já na URL alvo, evitando recarregar e
        // perder o estado da página.
        if (openClient.url === targetUrl || typeof openClient.navigate !== 'function') return focused;
        return focused.then(client => client.navigate(targetUrl)).catch(() => {});
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
