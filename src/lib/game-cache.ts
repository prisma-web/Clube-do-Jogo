import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from './types';
import type { IGDBGameResult } from './igdb';

export async function cacheIGDBGames(supabase: SupabaseClient, games: IGDBGameResult[]): Promise<Game[]> {
  const saved: Game[] = [];
  for (const game of games) {
    const payload = {
      igdb_id: game.id,
      title: game.title,
      duration_hours: game.duration_hours,
      average_rating: game.average_rating,
      release_year: game.release_year,
      image_url: game.image_url ?? 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
      description: game.description,
      screenshot_urls: game.screenshot_urls,
      trailer_url: game.trailer_url,
      genres: game.genres,
      platforms: game.platforms,
      platform_ids: game.platform_ids,
    };
    let { data, error } = await supabase.from('games').upsert(payload, { onConflict: 'igdb_id' }).select().single();
    if (error?.code === 'PGRST204') {
      const { average_rating, release_year, screenshot_urls, trailer_url, genres, platforms, platform_ids, ...legacyPayload } = payload;
      const retry = await supabase.from('games').upsert(legacyPayload, { onConflict: 'igdb_id' }).select().single();
      data = retry.data ? { ...retry.data, average_rating, release_year, screenshot_urls, trailer_url, genres, platforms, platform_ids } : retry.data;
      error = retry.error;
    }
    if (!error && data) {
      saved.push(data as Game);
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
        saved.push((updated || { ...existing, ...metadata }) as Game);
      }
      continue;
    }
    if (error) console.error('Erro ao armazenar jogo da IGDB:', error);
  }
  return saved;
}
