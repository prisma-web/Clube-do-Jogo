import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const releases = 'https://github.com/prisma-web/Clube-do-Jogo/releases/';
const fixtures = process.env.GITHUB_RELEASES_FIXTURES || fileURLToPath(new URL('./releases/', import.meta.url));
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  if (!url.startsWith(releases)) return realFetch(input, init);
  try {
    const body = await readFile(join(fixtures, url.slice(releases.length)), 'utf8');
    return new Response(body, { headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
};
