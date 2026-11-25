// Loaded into the Next dev server by playwright.config.ts: answers the GitHub release lookups with a fixture.
import { readFileSync } from 'node:fs';

const update = JSON.parse(readFileSync(new URL('./product-update.json', import.meta.url), 'utf8'));
const assetUrl = `https://github.com/prisma-web/Clube-do-Jogo/releases/download/${update.id}/product-update.json`;
const responses = {
  'https://api.github.com/repos/prisma-web/Clube-do-Jogo/releases/latest': { tag_name: update.id, assets: [{ name: 'product-update.json', browser_download_url: assetUrl }] },
  [assetUrl]: update,
};
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  return url in responses ? Promise.resolve(Response.json(responses[url])) : realFetch(input, init);
};
