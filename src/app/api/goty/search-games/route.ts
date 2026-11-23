import { NextResponse } from 'next/server';
import { GOTY_2026_CURATED_CATALOG, type GotySearchGameResult } from '@clube-do-jogo/domain';
import { createClient } from '@/lib/supabase/server';
import { searchGoty2026GamesWithIGDB } from '@/lib/igdb';
import { cacheIGDBGames } from '@/lib/game-cache';
import type { Game } from '@/lib/types';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function searchCurated2026(query: string): GotySearchGameResult[] {
  const needle = normalize(query);
  if (!needle) return [...GOTY_2026_CURATED_CATALOG];
  return GOTY_2026_CURATED_CATALOG.filter(game =>
    normalize(game.title).includes(needle)
    || (game.genres || []).some(genre => normalize(genre).includes(needle))
    || (game.platforms || []).some(platform => normalize(platform).includes(needle)),
  );
}

function deduplicateGames(items: GotySearchGameResult[]): GotySearchGameResult[] {
  const seen = new Set<string>();
  const result: GotySearchGameResult[] = [];
  for (const item of items) {
    const key = item.igdb_id ? `igdb:${item.igdb_id}` : `title:${normalize(item.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';
  const includeAllYears = searchParams.get('includeAllYears') === 'true';
  const limit = Math.max(1, Math.min(30, Number(searchParams.get('limit')) || 18));

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const merged: GotySearchGameResult[] = [];
    let source: 'igdb' | 'cache' | 'curated' = 'curated';

    // 1. Consulta IGDB com análise de data comercial efetiva 2026
    try {
      const igdbGames = await searchGoty2026GamesWithIGDB({
        query,
        includeAllYears,
        limit,
        year: 2026,
      });

      if (igdbGames.length > 0) {
        source = 'igdb';
        const cached = await cacheIGDBGames(supabase, igdbGames);
        const byIgdbId = new Map<number, Game>(
          cached.flatMap(item => (item.igdb_id ? [[item.igdb_id, item] as const] : [])),
        );

        for (const igdbGame of igdbGames) {
          const persisted = byIgdbId.get(igdbGame.id);
          merged.push({
            id: persisted?.id || `igdb-${igdbGame.id}`,
            igdb_id: igdbGame.id,
            title: persisted?.title || igdbGame.title,
            duration_hours: persisted?.duration_hours ?? igdbGame.duration_hours,
            average_rating: persisted?.average_rating ?? igdbGame.average_rating,
            release_year: igdbGame.effective_release_year ?? persisted?.release_year ?? igdbGame.release_year,
            image_url: persisted?.image_url ?? igdbGame.image_url,
            description: persisted?.description || igdbGame.description,
            screenshot_urls: persisted?.screenshot_urls ?? igdbGame.screenshot_urls,
            trailer_url: persisted?.trailer_url ?? igdbGame.trailer_url,
            genres: persisted?.genres ?? igdbGame.genres,
            platforms: persisted?.platforms ?? igdbGame.platforms,
            platform_ids: persisted?.platform_ids ?? igdbGame.platform_ids,
            release_eligibility: igdbGame.release_eligibility,
            effective_release_year: igdbGame.effective_release_year,
            effective_release_date: igdbGame.effective_release_date,
            eligibility_label: igdbGame.eligibility_label,
            is_eligible_2026: igdbGame.is_eligible_2026,
          });
        }
      }
    } catch (igdbError) {
      console.warn('Fallback na busca GOTY 2026 (IGDB indisponível):', igdbError);
    }

    // 2. Complementa com cache local do Supabase (jogos de 2026 ou qualquer ano se includeAllYears)
    if (merged.length < limit) {
      let dbQuery = supabase.from('games').select('*').limit(limit);
      if (query) dbQuery = dbQuery.ilike('title', `%${query}%`);
      if (!includeAllYears) dbQuery = dbQuery.eq('release_year', 2026);
      const { data: localGames } = await dbQuery.order('average_rating', { ascending: false, nullsFirst: false });

      if (localGames && localGames.length > 0) {
        if (source === 'curated') source = 'cache';
        for (const row of localGames as Game[]) {
          const is2026 = row.release_year === 2026;
          merged.push({
            ...row,
            release_eligibility: is2026 ? 'commercial_2026' : 'manual_override',
            effective_release_year: row.release_year ?? null,
            effective_release_date: row.release_year ? `${row.release_year}` : null,
            eligibility_label: is2026 ? 'Lançamento 2026' : (row.release_year ? `Lançado em ${row.release_year}` : 'Outro ano'),
            is_eligible_2026: is2026,
          });
        }
      }
    }

    // 3. Complementa com catálogo curado de 2026 (útil para lançamentos recentes / offline)
    if (merged.length < limit) {
      for (const curated of searchCurated2026(query)) {
        merged.push(curated);
      }
    }

    const items = deduplicateGames(merged).slice(0, limit);
    return NextResponse.json({
      items,
      source,
      only2026: !includeAllYears,
    });
  } catch (error) {
    console.error('Erro na rota /api/goty/search-games:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao buscar jogos de 2026.' },
      { status: 500 },
    );
  }
}
