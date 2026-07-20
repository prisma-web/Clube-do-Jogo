import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchGamesWithGrok } from '@/lib/grok';

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

    // Se encontramos resultados locais suficientes (ex: 2 ou mais), podemos retorná-los para ser mais rápido.
    // Mas para garantir uma busca fresca e completa, se o cache estiver vazio ou quisermos mais, chamamos o Grok.
    if (cachedGames && cachedGames.length >= 2) {
      return NextResponse.json(cachedGames);
    }

    // 3. Caso contrário, fazemos a chamada ao Grok para buscar e estruturar
    const grokResults = await searchGamesWithGrok(query);

    // 4. Salvar os novos jogos retornados pelo Grok no Supabase (ignorando duplicados pelo título)
    const savedGames: any[] = [];
    for (const game of grokResults) {
      // Tentar inserir o jogo
      const { data: inserted, error: insertError } = await supabase
        .from('games')
        .insert({
          title: game.title,
          duration_hours: game.duration_hours,
          image_url: game.image_url || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80', // Imagem fallback
          description: game.description
        })
        .select()
        .single();

      if (!insertError && inserted) {
        savedGames.push(inserted);
      } else if (insertError && insertError.code === '23505') {
        // Código 23505 é erro de chave única (Unique Constraint no título)
        // Se já existe, apenas buscamos o jogo existente no banco
        const { data: existing } = await supabase
          .from('games')
          .select('*')
          .eq('title', game.title)
          .single();
        if (existing) {
          savedGames.push(existing);
        }
      } else {
        console.error('Erro ao inserir jogo buscado:', insertError);
      }
    }

    // Retorna a combinação de resultados salvos ou o que temos no cache
    const finalResults = savedGames.length > 0 ? savedGames : (cachedGames || []);
    return NextResponse.json(finalResults);
  } catch (error: any) {
    console.error('Erro na API de busca:', error);
    return NextResponse.json({ error: error.message || 'Erro interno do servidor.' }, { status: 500 });
  }
}
