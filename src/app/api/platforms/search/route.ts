import type { ApiSearchParams } from '@clube-do-jogo/data';
import { contractJson } from '@/lib/api-route';
import { createClient } from '@/lib/supabase/server';
import { searchPlatformsWithIGDB } from '@/lib/igdb';

const json = contractJson<'searchPlatforms'>();

export async function GET(request: Request) {
  const searchParams: ApiSearchParams<'searchPlatforms'> = new URL(request.url).searchParams;
  const query = searchParams.get('q')?.trim();
  if (!query) return json({ error: 'Parâmetro de busca "q" é obrigatório.' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    return json(await searchPlatformsWithIGDB(query));
  } catch (error) {
    console.error('Erro ao buscar plataformas:', error);
    return json({ error: error instanceof Error ? error.message : 'Não foi possível buscar consoles.' }, { status: 500 });
  }
}
