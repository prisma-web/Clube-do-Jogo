import type { IGDBCharacterMugshot, IGDBGameResult, IGDBPlatformResult } from './igdb';

/**
 * Catálogo local usado no lugar da IGDB quando IGDB_OFFLINE_CATALOG=1.
 *
 * Existe para as verificações vivas (fixture Supabase + Next local) que não têm
 * o IGDB_CLIENT_ID/SECRET. A build final tem o segredo e nunca liga esta flag.
 * Os jogos casam com o seed da fixture (Outer Wilds, Hollow Knight, Celeste,
 * Hades) e trazem todos os campos que /api/search considera "metadados frescos",
 * senão a rota tenta a IGDB de qualquer jeito.
 */
export function isOfflineCatalogEnabled(): boolean {
  return process.env.IGDB_OFFLINE_CATALOG === '1';
}

const PLATFORMS: IGDBPlatformResult[] = [
  { igdb_platform_id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC', logo_url: null },
  { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch', logo_url: null },
  { igdb_platform_id: 48, name: 'PlayStation 4', abbreviation: 'PS4', logo_url: null },
  { igdb_platform_id: 167, name: 'PlayStation 5', abbreviation: 'PS5', logo_url: null },
  { igdb_platform_id: 49, name: 'Xbox One', abbreviation: 'XONE', logo_url: null },
  { igdb_platform_id: 169, name: 'Xbox Series X|S', abbreviation: 'Series X|S', logo_url: null },
];

function platformNames(ids: number[]) {
  return ids.map(id => PLATFORMS.find(platform => platform.igdb_platform_id === id)!.name);
}

function image(slug: string, kind: string, width: number, height: number) {
  return `https://picsum.photos/seed/cdj-${slug}-${kind}/${width}/${height}`;
}

function game(input: {
  id: number;
  slug: string;
  title: string;
  /** Capa real da IGDB quando o jogo existe no seed; sem ela a rota de mídia não sobrescreve a capa gravada. */
  cover?: string;
  year: number;
  hours: number;
  rating: number;
  genres: string[];
  platformIds: number[];
  description: string;
}): IGDBGameResult {
  return {
    id: input.id,
    title: input.title,
    duration_hours: input.hours,
    average_rating: input.rating,
    release_year: input.year,
    image_url: input.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${input.cover}.jpg` : null,
    description: input.description,
    screenshot_urls: [1, 2, 3].map(index => image(input.slug, `shot${index}`, 1280, 720)),
    trailer_url: null,
    genres: input.genres,
    platforms: platformNames(input.platformIds),
    platform_ids: input.platformIds,
  };
}

export const OFFLINE_CATALOG: readonly IGDBGameResult[] = [
  game({ id: 900001, slug: 'outer-wilds', cover: 'co65ac', title: 'Outer Wilds', year: 2019, hours: 17, rating: 86, genres: ['Adventure', 'Puzzle'], platformIds: [6, 48, 49, 130], description: 'Um sistema solar preso num loop de 22 minutos, explorado com curiosidade e um banjo.' }),
  game({ id: 900002, slug: 'hollow-knight', cover: 'co93cr', title: 'Hollow Knight', year: 2017, hours: 27, rating: 88, genres: ['Platform', 'Adventure'], platformIds: [6, 48, 49, 130], description: 'Um reino de insetos em ruínas, desenhado à mão e cheio de segredos.' }),
  game({ id: 900003, slug: 'celeste', cover: 'co3byy', title: 'Celeste', year: 2018, hours: 8, rating: 88, genres: ['Platform', 'Indie'], platformIds: [6, 48, 49, 130], description: 'Madeline escala uma montanha e o próprio pânico em fases precisas e generosas.' }),
  game({ id: 900004, slug: 'hades', cover: 'co39vc', title: 'Hades', year: 2020, hours: 22, rating: 90, genres: ['Role-playing (RPG)', 'Hack and slash/Beat \'em up'], platformIds: [6, 48, 167, 49, 169, 130], description: 'Zagreu tenta fugir do submundo, uma corrida de cada vez, com a família inteira comentando.' }),
  game({ id: 900005, slug: 'stardew-valley', title: 'Stardew Valley', year: 2016, hours: 53, rating: 87, genres: ['Simulator', 'Role-playing (RPG)'], platformIds: [6, 48, 49, 130], description: 'Herde uma fazenda, conheça a vila e descubra que a mina tem mais camadas do que parece.' }),
  game({ id: 900006, slug: 'disco-elysium', title: 'Disco Elysium', year: 2019, hours: 30, rating: 91, genres: ['Role-playing (RPG)', 'Adventure'], platformIds: [6, 48, 167, 49, 169, 130], description: 'Um detetive sem memória, uma cidade sem esperança e uma cabeça cheia de vozes discordando.' }),
  game({ id: 900007, slug: 'return-of-the-obra-dinn', title: 'Return of the Obra Dinn', year: 2018, hours: 9, rating: 86, genres: ['Puzzle', 'Adventure'], platformIds: [6, 48, 49, 130], description: 'Sessenta pessoas sumiram de um navio mercante. Descubra quem era cada uma e como morreu.' }),
  game({ id: 900008, slug: 'tunic', title: 'Tunic', year: 2022, hours: 12, rating: 85, genres: ['Adventure', 'Puzzle'], platformIds: [6, 48, 167, 49, 169, 130], description: 'Uma raposinha, um manual em língua desconhecida e um mundo que esconde as regras.' }),
  game({ id: 900009, slug: 'outer-wilds-echoes', title: 'Outer Wilds: Echoes of the Eye', year: 2021, hours: 8, rating: 84, genres: ['Adventure', 'Puzzle'], platformIds: [6, 48, 49, 130], description: 'Uma expansão que acrescenta um lugar novo ao sistema solar sem quebrar o loop.' }),
  game({ id: 900010, slug: 'chicory', title: 'Chicory: A Colorful Tale', year: 2021, hours: 10, rating: 83, genres: ['Adventure', 'Puzzle'], platformIds: [6, 48, 167, 130], description: 'O mundo perdeu as cores e cabe a você, com um pincel, devolvê-las.' }),
];

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function offlineSearchGames(query: string): IGDBGameResult[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  return OFFLINE_CATALOG.filter(entry => normalize(entry.title).includes(needle)).slice(0, 5);
}

export function offlineBrowseGames(options: { query?: string; platform?: number; year?: number; offset?: number; limit?: number }): IGDBGameResult[] {
  const limit = Math.max(1, Math.min(40, options.limit || 24));
  const offset = Math.max(0, options.offset || 0);
  const needle = normalize(options.query?.trim() ?? '');
  return OFFLINE_CATALOG
    .filter(entry => !needle || normalize(entry.title).includes(needle))
    .filter(entry => !options.platform || entry.platform_ids.includes(Math.trunc(options.platform)))
    .filter(entry => !options.year || entry.release_year === options.year)
    .slice(offset, offset + limit);
}

export function offlineGameById(id: number): IGDBGameResult | null {
  return OFFLINE_CATALOG.find(entry => entry.id === id) ?? null;
}

export function offlineGameMugshots(gameId: number): IGDBCharacterMugshot[] {
  const entry = offlineGameById(gameId);
  if (!entry) return [];
  return [1, 2].map(index => ({
    id: entry.id * 10 + index,
    name: `${entry.title} — personagem ${index}`,
    image_url: image(`${entry.id}`, `mugshot${index}`, 264, 374),
  }));
}

export function offlineSearchPlatforms(query: string): IGDBPlatformResult[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  return PLATFORMS.filter(platform =>
    normalize(platform.name).includes(needle) || normalize(platform.abbreviation ?? '').includes(needle));
}
