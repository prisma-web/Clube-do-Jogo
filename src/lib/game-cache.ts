import type { DataSupabaseClient } from '@clube-do-jogo/data';
import type { Game } from './types';
import type { IGDBGameResult } from './igdb';

function payloadFor(game: IGDBGameResult) {
  return {
    igdb_id: game.id,
    title: game.title,
    duration_hours: game.duration_hours,
    average_rating: game.average_rating,
    release_year: game.release_year,
    // O PostgREST monta o ON CONFLICT DO UPDATE SET a partir das chaves do payload,
    // então omitir image_url preserva a capa já salva em vez de sobrescrevê-la.
    ...(game.image_url ? { image_url: game.image_url } : {}),
    description: game.description,
    screenshot_urls: game.screenshot_urls,
    trailer_url: game.trailer_url,
    genres: game.genres,
    platforms: game.platforms,
    platform_ids: game.platform_ids,
  };
}

// Cada jogo de entrada junto da linha que o representa no banco. A linha pode ter
// outro igdb_id (título repetido no fallback 23505), então ninguém casa pelo id dela.
type CachedGame = [IGDBGameResult, Game];

async function cacheOneByOne(supabase: DataSupabaseClient, games: IGDBGameResult[]): Promise<CachedGame[]> {
  const saved: CachedGame[] = [];
  for (const game of games) {
    const payload = payloadFor(game);
    let { data, error } = await supabase.from('games').upsert(payload, { onConflict: 'igdb_id' }).select().single();
    if (error?.code === 'PGRST204') {
      const { average_rating, release_year, screenshot_urls, trailer_url, genres, platforms, platform_ids, ...legacyPayload } = payload;
      const retry = await supabase.from('games').upsert(legacyPayload, { onConflict: 'igdb_id' }).select().single();
      data = retry.data ? { ...retry.data, average_rating, release_year, screenshot_urls, trailer_url, genres, platforms, platform_ids } : retry.data;
      error = retry.error;
    }
    if (!error && data) {
      saved.push([game, data as Game]);
      continue;
    }
    if (error?.code === '23505') {
      const { data: existing } = await supabase.from('games').select('*').eq('title', game.title).maybeSingle();
      if (existing) {
        const metadata = {
          igdb_id: existing.igdb_id ?? game.id,
          average_rating: existing.average_rating ?? game.average_rating,
          release_year: existing.release_year ?? game.release_year,
          screenshot_urls: existing.screenshot_urls?.length ? existing.screenshot_urls : game.screenshot_urls,
          trailer_url: existing.trailer_url ?? game.trailer_url,
          genres: existing.genres?.length ? existing.genres : game.genres,
          platforms: existing.platforms?.length ? existing.platforms : game.platforms,
          platform_ids: existing.platform_ids?.length ? existing.platform_ids : game.platform_ids,
        };
        const { data: updated } = await supabase.from('games').update(metadata).eq('id', existing.id).select().single();
        saved.push([game, (updated || { ...existing, ...metadata }) as Game]);
      }
      continue;
    }
    if (error) console.error('Erro ao armazenar jogo da IGDB:', error);
  }
  return saved;
}

async function cacheBatch(supabase: DataSupabaseClient, games: IGDBGameResult[]): Promise<CachedGame[]> {
  if (!games.length) return [];
  const { data, error } = await supabase.from('games').upsert(games.map(payloadFor), { onConflict: 'igdb_id' }).select();
  // Um lote é tudo ou nada, e as recuperações por linha (schema antigo, título
  // duplicado) só existem uma linha por vez, então a falha cai no caminho lento.
  if (error || !data) return cacheOneByOne(supabase, games);
  // O lote volta fora de ordem, mas o ON CONFLICT (igdb_id) garante que cada linha
  // carrega o igdb_id do jogo que a gravou.
  const rows = new Map((data as Game[]).map(row => [row.igdb_id, row]));
  return games.flatMap(game => {
    const row = rows.get(game.id);
    return row ? [[game, row] satisfies CachedGame] : [];
  });
}

export async function cacheIGDBGames(supabase: DataSupabaseClient, games: IGDBGameResult[]): Promise<Game[]> {
  if (!games.length) return [];
  // Um lote só para quem tem capa e outro para quem não tem: o postgrest-js manda
  // `columns` com a união das chaves do lote, então misturar os dois faria a capa
  // ausente de um apagar a capa gravada do outro.
  const [withCover, withoutCover] = await Promise.all([
    cacheBatch(supabase, games.filter(game => game.image_url)),
    cacheBatch(supabase, games.filter(game => !game.image_url)),
  ]);
  const saved = new Map([...withCover, ...withoutCover]);
  return games.flatMap(game => saved.get(game) ?? []);
}
