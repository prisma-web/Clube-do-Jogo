import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchGamesWithIGDB } from '@/lib/igdb';
import { cacheIGDBGames } from '@/lib/game-cache';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.trim() === '') {
    return NextResponse.json({ error: 'Parâmetro de busca "q" é obrigatório.' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // 1. Verificar se o usuário está autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    // 2. Buscar no banco de dados primeiro (cache local)
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

    // Se encontramos resultados locais suficientes e completos, retornamos do cache
    if (cachedGames && cachedGames.length >= 2 && hasFreshMetadata) {
      return NextResponse.json(cachedGames);
    }

    // 3. Buscar na IGDB
    const igdbResults = await searchGamesWithIGDB(query);

    // 4. Persistir o catálogo externo para que qualquer card possa abrir a página do jogo.
    const savedGames = await cacheIGDBGames(supabase, igdbResults);

    const finalResults = savedGames.length > 0 ? savedGames : (cachedGames || []);
    return NextResponse.json(finalResults);
  } catch (error: unknown) {
    console.error('Erro na API de busca:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno do servidor.' }, { status: 500 });
  }
}
