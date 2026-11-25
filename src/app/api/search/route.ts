import { gameRowsAsDomain, normalizeSearchQuery, type ApiSearchParams } from '@clube-do-jogo/data';
import { contractJson } from '@/lib/api-route';
import { createRequestContext } from '@/lib/supabase/server';
import { searchGamesWithIGDB } from '@/lib/igdb';
import { cacheIGDBGames } from '@/lib/game-cache';

const json = contractJson<'searchGames'>();

export async function GET(request: Request) {
  const searchParams: ApiSearchParams<'searchGames'> = new URL(request.url).searchParams;
  const query = normalizeSearchQuery(searchParams.get('q'));

  if (!query) {
    return json({ error: 'Parâmetro de busca "q" é obrigatório.' }, { status: 400 });
  }

  try {
    const { supabase, userId } = await createRequestContext();

    if (!userId) {
      return json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { data: cachedGames, error: dbError } = await supabase
      .from('games')
      .select('*')
      .ilike('title', `%${query}%`)
      .limit(5);

    if (dbError) {
      console.error('Erro ao ler cache do banco:', dbError);
    }

    const hasFreshMetadata = cachedGames?.every(game =>
      game.average_rating !== null &&
      game.release_year !== null &&
      Array.isArray(game.screenshot_urls) &&
      game.screenshot_urls.length >= 3 &&
      Array.isArray(game.genres) &&
      game.genres.length > 0 &&
      Array.isArray(game.platforms) &&
      game.platforms.length > 0
    );

    if (cachedGames && cachedGames.length >= 2 && hasFreshMetadata) {
      return json(gameRowsAsDomain(cachedGames));
    }

    const igdbResults = await searchGamesWithIGDB(query);

    const savedGames = await cacheIGDBGames(supabase, igdbResults);

    const finalResults = savedGames.length > 0 ? savedGames : gameRowsAsDomain(cachedGames || []);
    return json(finalResults);
  } catch (error: unknown) {
    console.error('Erro na API de busca:', error);
    return json({ error: error instanceof Error ? error.message : 'Erro interno do servidor.' }, { status: 500 });
  }
}
