import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGameByIGDBId, searchGamesWithIGDB } from '@/lib/igdb';

interface CachedGame {
  id: string;
  igdb_id: number | null;
  title: string;
  average_rating: number | null;
  release_year: number | null;
}

const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json().catch(() => ({}));
    const excludedIds = Array.isArray(body.excludeIds)
      ? body.excludeIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
    }

    let gamesQuery = supabase
      .from('games')
      .select('id, igdb_id, title, average_rating, release_year')
      .is('average_rating', null)
      .order('title')
      .limit(25);

    if (excludedIds.length > 0) {
      gamesQuery = gamesQuery.not('id', 'in', `(${excludedIds.join(',')})`);
    }

    const { data: games, error: gamesError } = await gamesQuery;

    if (gamesError) throw gamesError;

    const targets = (games || []) as CachedGame[];
    let updatedCount = 0;
    let checkedCount = 0;

    for (const game of targets) {
      checkedCount += 1;

      try {
        let match = game.igdb_id ? await getGameByIGDBId(game.igdb_id) : null;

        if (!match) {
          const igdbResults = await searchGamesWithIGDB(game.title);
          const normalizedTitle = normalizeTitle(game.title);
          match =
            igdbResults.find(result => normalizeTitle(result.title) === normalizedTitle) ??
            igdbResults[0];
        }

        if (!match?.average_rating) continue;

        const { error: updateError } = await supabase
          .from('games')
          .update({
            igdb_id: game.igdb_id ?? match.id,
            average_rating: match.average_rating,
            release_year: game.release_year ?? match.release_year,
          })
          .eq('id', game.id);

        if (!updateError) updatedCount += 1;
      } catch (error) {
        console.error(`Erro ao atualizar nota de ${game.title}:`, error);
      }
    }

    const { count: remainingCount, error: countError } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .is('average_rating', null);

    if (countError) throw countError;

    return NextResponse.json({
      checkedIds: targets.map(game => game.id),
      checkedCount,
      updatedCount,
      remainingCount: remainingCount ?? 0,
    });
  } catch (error: unknown) {
    console.error('Erro no backfill de notas:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
