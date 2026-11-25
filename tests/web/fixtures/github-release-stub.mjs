// Loaded into the Next dev server by playwright.config.ts: answers the latest release notes download with a fixture.
import { readFileSync } from 'node:fs';

const update = JSON.parse(readFileSync(new URL('./product-update.json', import.meta.url), 'utf8'));
const latestUrl = 'https://github.com/prisma-web/Clube-do-Jogo/releases/latest/download/product-update.json';
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  return url === latestUrl ? Promise.resolve(Response.json(update)) : realFetch(input, init);
};
