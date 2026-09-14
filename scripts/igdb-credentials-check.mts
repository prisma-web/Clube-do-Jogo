// O catálogo offline responderia por todas as chamadas e o teste passaria sem
// tocar na IGDB. Desligar antes de importar o módulo, que lê a flag na carga.
delete process.env.IGDB_OFFLINE_CATALOG;

const { browseGamesWithIGDB, getGameByIGDBId, getGameMugshotsByIGDBId, searchGamesWithIGDB, searchPlatformsWithIGDB } =
  await import('../src/lib/igdb');

const OUTER_WILDS = 11737;

const checks: Array<{ name: string; run: () => Promise<string> }> = [
  {
    name: 'token do Twitch',
    async run() {
      const clientId = process.env.IGDB_CLIENT_ID;
      const clientSecret = process.env.IGDB_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('defina IGDB_CLIENT_ID e IGDB_CLIENT_SECRET');
      const response = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const { expires_in } = await response.json();
      return `expira em ${Math.round(expires_in / 86400)} dias`;
    },
  },
  {
    name: 'busca de jogos',
    async run() {
      const games = await searchGamesWithIGDB('outer wilds');
      if (!games.length) throw new Error('nenhum resultado');
      if (!games[0].image_url) throw new Error('primeiro resultado sem capa');
      return `${games.length} resultados, capa e ${games[0].platforms.length} plataformas no primeiro`;
    },
  },
  {
    name: 'descoberta por popularidade',
    async run() {
      const games = await browseGamesWithIGDB({ sort: 'popular', limit: 12, offset: 0 });
      if (games.length < 12) throw new Error(`esperava 12, veio ${games.length}`);
      return `${games.length} jogos`;
    },
  },
  {
    name: 'tempo para zerar',
    async run() {
      const games = await browseGamesWithIGDB({ sort: 'popular', limit: 12, offset: 0 });
      const withDuration = games.filter(game => game.duration_hours > 0);
      if (!withDuration.length) throw new Error('nenhum jogo trouxe duração; o endpoint game_time_to_beats falhou em silêncio');
      return `${withDuration.length} de ${games.length} com duração`;
    },
  },
  {
    name: 'jogo por id',
    async run() {
      const game = await getGameByIGDBId(OUTER_WILDS);
      if (!game) throw new Error(`id ${OUTER_WILDS} não encontrado`);
      return `${game.title}, ${game.screenshot_urls.length} screenshots`;
    },
  },
  {
    name: 'retratos de personagem',
    async run() {
      const mugshots = await getGameMugshotsByIGDBId(OUTER_WILDS);
      return mugshots.length ? `${mugshots.length} retratos` : 'nenhum retrato para este jogo, endpoint respondeu';
    },
  },
  {
    name: 'busca de plataformas',
    async run() {
      const platforms = await searchPlatformsWithIGDB('playstation');
      if (!platforms.length) throw new Error('nenhuma plataforma');
      return `${platforms.length} plataformas`;
    },
  },
];

let failed = 0;
for (const check of checks) {
  try {
    console.log(`ok    ${check.name.padEnd(28)} ${await check.run()}`);
  } catch (error) {
    failed += 1;
    console.log(`FALHA ${check.name.padEnd(28)} ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(failed ? `\n${failed} de ${checks.length} falharam.` : `\n${checks.length} de ${checks.length} passaram. As credenciais servem para tudo que o app usa.`);
process.exit(failed ? 1 : 0);
