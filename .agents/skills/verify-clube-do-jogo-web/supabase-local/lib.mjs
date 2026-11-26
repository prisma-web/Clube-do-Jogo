import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export const BASE = process.env.CDJ_WEB_URL || 'http://127.0.0.1:3000';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw new Error(`CDJ_WEB_URL precisa ser loopback: ${BASE}`);
export const OUT = process.env.OUT || 'evidence/supabase-local';
fs.mkdirSync(OUT, { recursive: true });
export const PASSWORD = 'fixture-local-123';

export function sql(query) {
  return execFileSync(new URL('../../../../scripts/local-supabase.sh', import.meta.url).pathname, ['psql', '-tA', '-F', ' | ', '-c', query], { encoding: 'utf8' }).trim();
}

export const log = [];
export function note(line) { console.log(line); log.push(line); fs.appendFileSync(`${OUT}/log.txt`, line + '\n'); }

export async function newUser(browser, email, tag) {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await context.newPage();
  const forbidden = [];
  page.on('request', request => {
    const url = request.url();
    if (/supabase\.co/.test(url)) forbidden.push(url);
    if (url.includes('/api/push/')) note(`[${tag}] -> ${request.method()} ${new URL(url).pathname} ${request.postData() || ''}`);
  });
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/push/')) {
      let body = '';
      try { body = await response.text(); } catch {}
      note(`[${tag}] <- ${response.status()} ${new URL(url).pathname} ${body}`);
    }
  });
  page.on('pageerror', error => note(`[${tag}] pageerror ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') note(`[${tag}] console.error ${message.text().slice(0, 300)}`); });
  await page.goto(`${BASE}/`);
  await page.getByPlaceholder('Seu e-mail').fill(email);
  await page.getByPlaceholder('Sua senha').fill(PASSWORD);
  await page.getByPlaceholder('Sua senha').press('Enter');
  await page.waitForFunction(() => !document.querySelector('input[type=password]'), null, { timeout: 60000 });
  return { context, page, forbidden, tag };
}

export async function closeQuickVoting(page) {
  const close = page.getByRole('button', { name: 'Fechar votação rápida' });
  if (await close.isVisible().catch(() => false)) { await close.click(); return true; }
  return false;
}

export async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

export async function launch() {
  return chromium.launch({ headless: true });
}

export function finish(browser) {
  return browser.close();
}

export async function tap(page, locator, label) {
  await closeQuickVoting(page);
  try {
    await locator.click({ timeout: 4000 });
  } catch (error) {
    const cover = String(error.message).match(/<([a-z]+)[^>]*?(aria-label="[^"]*")?[^>]*> (?:from .*? )?(?:subtree )?intercepts pointer events/);
    note(`ACHADO: "${label}" coberto por outro elemento (${cover ? cover[0].slice(0, 160) : error.message.split('\n')[0]})`);
    await shot(page, `blocked-${label.replace(/\W+/g, '-')}`);
    await locator.dispatchEvent('click');
  }
}
