import { NextResponse } from 'next/server';
import { GOTY_2026_EDITION_YEAR } from '@clube-do-jogo/domain';
import { createClient } from '@/lib/supabase/server';
import { lookupIGDBCoverByTitle } from '@/lib/igdb';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as { limit?: number };
    const maxQueries = Math.max(1, Math.min(30, body.limit ?? 20));

    const { data: nominees, error: nomineesError } = await supabase
      .from('goty_nominees')
      .select('id, game_query, image_url')
      .eq('edition_year', GOTY_2026_EDITION_YEAR)
      .is('image_url', null)
      .not('game_query', 'is', null);

    if (nomineesError) throw nomineesError;
    if (!nominees || nominees.length === 0) {
      return NextResponse.json({ updated: 0, remaining: 0 });
    }

    // Agrupa por título de jogo para não consultar a IGDB repetidamente para jogos com várias indicações
    const byQuery = new Map<string, string[]>();
    for (const row of nominees as Array<{ id: string; game_query: string | null }>) {
      if (!row.game_query) continue;
      const list = byQuery.get(row.game_query) || [];
      list.push(row.id);
      byQuery.set(row.game_query, list);
    }

    const queries = Array.from(byQuery.entries()).slice(0, maxQueries);
    let updatedCount = 0;

    for (const [gameQuery, nomineeIds] of queries) {
      // 1. Tenta primeiro o cache local em public.games
      const { data: cachedGame } = await supabase
        .from('games')
        .select('id, igdb_id, image_url')
        .ilike('title', gameQuery)
        .not('image_url', 'is', null)
        .limit(1)
        .maybeSingle();

      let imageUrl: string | null = cachedGame?.image_url ?? null;
      let igdbId: number | null = cachedGame?.igdb_id ?? null;
      const gameId: string | null = cachedGame?.id ?? null;

      // 2. Se não estiver em cache, busca capa na IGDB
      if (!imageUrl) {
        const match = await lookupIGDBCoverByTitle(gameQuery);
        if (match?.image_url) {
          imageUrl = match.image_url;
          igdbId = match.igdb_id;
        }
      }

      if (!imageUrl) continue;

      for (const nomineeId of nomineeIds) {
        const { error: rpcError } = await supabase.rpc('update_goty_nominee_cover', {
          target_nominee_id: nomineeId,
          next_image_url: imageUrl,
          next_igdb_id: igdbId,
          next_game_id: gameId,
        });
        if (!rpcError) updatedCount += 1;
      }
    }

    return NextResponse.json({
      updated: updatedCount,
      remaining: Math.max(0, byQuery.size - queries.length),
    });
  } catch (error) {
    console.error('Erro ao resolver capas dos indicados GOTY 2026:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível atualizar as capas.' },
      { status: 500 },
    );
  }
}
