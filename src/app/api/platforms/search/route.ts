import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchPlatformsWithIGDB } from '@/lib/igdb';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ error: 'Parâmetro de busca "q" é obrigatório.' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    return NextResponse.json(await searchPlatformsWithIGDB(query));
  } catch (error) {
    console.error('Erro ao buscar plataformas:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível buscar consoles.' }, { status: 500 });
  }
}
