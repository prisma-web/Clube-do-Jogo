// Mede onde o tempo do /api/discover é gasto. Só leitura: nenhum write no Supabase.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path: string) {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of contents.split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1]] ??= match[2];
  }
}
loadEnv(process.env.IGDB_ENV ?? `${process.env.HOME}/.config/clube-igdb.env`);
loadEnv('apps/mobile/.env');
for (const name of ['IGDB_CLIENT_ID', 'IGDB_CLIENT_SECRET', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
  if (!process.env[name]) throw new Error(`falta ${name}; exporte no ambiente ou aponte IGDB_ENV para um arquivo que tenha`);
}

async function timed<T>(label: string, run: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const value = await run();
  const ms = Math.round(performance.now() - started);
  console.log(`${label.padEnd(44)} ${String(ms).padStart(6)} ms`);
  return [value, ms];
}

const [token] = await timed('token twitch (frio, 1x por instância)', async () => {
  const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
  return (await response.json()).access_token as string;
});

const headers = { 'Client-ID': process.env.IGDB_CLIENT_ID!, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' };
const body = 'fields id,name,summary,cover.image_id,first_release_date,total_rating,total_rating_count,rating,rating_count,aggregated_rating,hypes,screenshots.image_id,videos.video_id,genres.name,platforms.id,platforms.name; where total_rating_count > 20 & cover != null; sort total_rating_count desc; limit 24; offset 0;';

const igdbRuns: number[] = [];
for (let i = 0; i < 3; i += 1) {
  const [, ms] = await timed(`igdb browse popular limit=24 (${i + 1}/3)`, async () => {
    const response = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers, body });
    return (await response.json()).length;
  });
  igdbRuns.push(ms);
}

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const one = () => supabase.from('games').select('id').limit(1);

const [, sequential] = await timed('supabase: 24 idas sequenciais (o que o cache faz)', async () => {
  for (let i = 0; i < 24; i += 1) await one();
});
const [, batched] = await timed('supabase: 2 idas em paralelo (o lote novo)', async () => {
  await Promise.all([one(), one()]);
});

const igdb = Math.round(igdbRuns.reduce((a, b) => a + b, 0) / igdbRuns.length);
console.log(`\numa ida e volta ao supabase: ${Math.round(sequential / 24)} ms`);
console.log(`antes (24 upserts em fila) ≈ ${igdb} igdb + ${sequential} cache = ${igdb + sequential} ms`);
console.log(`depois (2 lotes paralelos) ≈ ${igdb} igdb + ${batched} cache = ${igdb + batched} ms`);
