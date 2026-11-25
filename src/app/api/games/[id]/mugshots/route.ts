import { contractJson } from '@/lib/api-route';
import { createClient } from '@/lib/supabase/server';
import { getGameMugshotsByIGDBId, searchGamesWithIGDB } from '@/lib/igdb';

const json = contractJson<'gameMugshots'>();

function normalizedTitle(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Não autorizado.' }, { status: 401 });

  const { data: game, error } = await supabase.from('games').select('igdb_id, title').eq('id', id).maybeSingle();
  if (error || !game) return json({ error: 'Jogo não encontrado.' }, { status: 404 });

  try {
    const igdbId = game.igdb_id
      ?? (await searchGamesWithIGDB(game.title)).find(candidate => normalizedTitle(candidate.title) === normalizedTitle(game.title))?.id;
    if (!igdbId) return json({ mugshots: [] });
    return json({ mugshots: await getGameMugshotsByIGDBId(igdbId) });
  } catch (value) {
    console.error('Erro ao buscar mugshots do jogo:', value);
    return json({ mugshots: [] });
  }
}
