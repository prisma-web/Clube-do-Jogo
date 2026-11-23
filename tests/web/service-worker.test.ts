import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

type Listener = (event: { request: Request; respondWith(response: Promise<Response>): void; waitUntil(promise: Promise<unknown>): void }) => void;

function loadServiceWorker(cachedNavigation: Response | undefined, network: () => Promise<Response>, cachedHome?: Response) {
  const listeners = new Map<string, Listener>();
  const store = new Map<string, Response>();
  if (cachedNavigation) store.set('https://clube.test/ranking', cachedNavigation);
  if (cachedHome) store.set('https://clube.test/jogo-do-mes', cachedHome);
  const cache = {
    put: async (request: Request, response: Response) => { store.set(request.url, response); },
    addAll: async () => undefined,
  };
  const context = {
    self: {
      location: { origin: 'https://clube.test' },
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    },
    caches: {
      open: async () => cache,
      match: async (request: Request | string) => store.get(typeof request === 'string' ? `https://clube.test${request}` : request.url)?.clone(),
    },
    fetch: network,
    URL,
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), context);
  return async (url: string) => {
    const request = new Request(url);
    Object.defineProperty(request, 'mode', { value: 'navigate' });
    let response: Promise<Response> | undefined;
    listeners.get('fetch')!({ request, respondWith: value => { response = value; }, waitUntil: () => undefined });
    return (await response!).text();
  };
}

test('page navigations serve the latest deploy when the network answers', async () => {
  const navigate = loadServiceWorker(new Response('old deploy'), async () => new Response('new deploy'));
  assert.equal(await navigate('https://clube.test/ranking'), 'new deploy');
});

test('page navigations fall back to the cached page offline', async () => {
  const navigate = loadServiceWorker(new Response('cached page'), async () => { throw new TypeError('offline'); });
  assert.equal(await navigate('https://clube.test/ranking'), 'cached page');
});

test('a page never visited falls back to the cached home offline', async () => {
  const navigate = loadServiceWorker(undefined, async () => { throw new TypeError('offline'); }, new Response('home'));
  assert.equal(await navigate('https://clube.test/perfil'), 'home');
});
