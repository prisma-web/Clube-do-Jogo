export interface GrokGameResult {
  title: string;
  duration_hours: number;
  image_url: string | null;
  description: string;
}

export async function searchGamesWithGrok(query: string): Promise<GrokGameResult[]> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error('GROK_API_KEY não configurada no servidor.');
  }

  const systemPrompt = `Você é um assistente especializado em videogames. O usuário está buscando um jogo pelo título ou descrição.
Retorne uma lista em formato JSON contendo no máximo 5 jogos que correspondam à busca.
Para cada jogo, você DEVE fornecer:
1. "title": O título oficial e correto do jogo.
2. "duration_hours": O tempo médio estimado de conclusão (focado na campanha principal/história, estilo HowLongToBeat Main Story) como um número (ex: 12.5). Deve ser um valor numérico real aproximado.
3. "image_url": Uma URL pública e confiável de imagem de capa do jogo (preferencialmente de wikis, Steam, RAWG, ou GOG). Se não tiver certeza absoluta de um link funcional e estável, retorne null.
4. "description": Uma breve sinopse ou descrição do jogo em português do Brasil (máximo 2 parágrafos).

Responda APENAS com um array JSON válido, sem markdown ou explicações antes ou depois. Exemplo de formato de resposta:
[
  {
    "title": "Outer Wilds",
    "duration_hours": 16,
    "image_url": "https://raw.githubusercontent.com/outer-wilds/assets/main/cover.jpg",
    "description": "Um mistério de loop temporal em um sistema solar de mundo aberto..."
  }
]`;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-2-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Busque jogos correspondentes à pesquisa: "${query}"` },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API do Grok (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return [];
    }

    // Limpar possíveis blocos de código markdown que o modelo possa retornar mesmo com instruções estritas
    const jsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const results = JSON.parse(jsonString) as GrokGameResult[];
    
    return results;
  } catch (error) {
    console.error('Erro ao buscar jogos com o Grok:', error);
    throw error;
  }
}
