export interface GeminiGameResult {
  title: string;
  duration_hours: number;
  image_url: string | null;
  description: string;
}

export async function searchGamesWithGemini(query: string): Promise<GeminiGameResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no servidor.');
  }

  const systemInstruction = `Você é um assistente especializado em videogames. O usuário está buscando um jogo pelo título ou descrição.
Retorne uma lista em formato JSON contendo no máximo 5 jogos que correspondam à busca.
Para cada jogo, você DEVE fornecer:
1. "title": O título oficial e correto do jogo.
2. "duration_hours": O tempo médio estimado de conclusão (focado na campanha principal/história, estilo HowLongToBeat Main Story) como um número (ex: 12.5). Deve ser um valor numérico real aproximado.
3. "image_url": Uma URL pública e confiável de imagem de capa do jogo (preferencialmente de wikis, Steam, RAWG, ou GOG). Se não tiver certeza absoluta de um link funcional e estável, retorne null.
4. "description": Uma breve sinopse ou descrição do jogo em português do Brasil (máximo 2 parágrafos).

Responda APENAS com um array JSON válido. Exemplo de formato de resposta:
[
  {
    "title": "Outer Wilds",
    "duration_hours": 16,
    "image_url": "https://raw.githubusercontent.com/outer-wilds/assets/main/cover.jpg",
    "description": "Um mistério de loop temporal em um sistema solar de mundo aberto..."
  }
]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `Busque jogos correspondentes à pesquisa: "${query}"` }],
            },
          ],
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API do Gemini (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      return [];
    }

    const results = JSON.parse(content.trim()) as GeminiGameResult[];
    return results;
  } catch (error) {
    console.error('Erro ao buscar jogos com o Gemini:', error);
    throw error;
  }
}
