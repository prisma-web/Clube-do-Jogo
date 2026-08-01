import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { browseGamesWithIGDB, type IGDBBrowseSort } from '@/lib/igdb';
import { cacheIGDBGames } from '@/lib/game-cache';
import type { DiscoverItem, DiscoverSource, Game } from '@/lib/types';

const catalogSources = new Set<DiscoverSource>(['popular', 'rated', 'recent', 'anticipated']);
const genreNames = new Map([[12, 'role-playing'], [31, 'adventure'], [32, 'indie'], [8, 'platform'], [9, 'puzzle'], [15, 'strategy'], [5, 'shooter']]);

function integerParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function matchesFilters(game: Game, query: string, genre?: number, platform?: number, year?: number) {
  const normalized = query.toLocaleLowerCase('pt-BR');
  if (normalized && ![game.title, ...(game.genres || []), ...(game.platforms || [])].some(value => value.toLocaleLowerCase('pt-BR').includes(normalized))) return false;
  if (genre) {
    const expected = genreNames.get(genre);
    if (expected && !(game.genres || []).some(value => value.toLocaleLowerCase('en-US').includes(expected))) return false;
  }
  if (platform && !(game.platform_ids || []).includes(platform)) return false;
  if (year && game.release_year !== year) return false;
  return true;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawSource = searchParams.get('source') as DiscoverSource | null;
  const source: DiscoverSource = rawSource && [...catalogSources, 'friends', 'ranking'].includes(rawSource) ? rawSource : 'popular';
  const query = searchParams.get('q')?.trim() || '';
  const genre = integerParam(searchParams.get('genre'));
  const platform = integerParam(searchParams.get('platform'));
  const year = integerParam(searchParams.get('year'));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);
  const limit = Math.max(1, Math.min(40, Number(searchParams.get('limit')) || 24));
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

    if (catalogSources.has(source)) {
      const external = await browseGamesWithIGDB({ query, sort: source as IGDBBrowseSort, genre, platform, year, offset, limit });
      const games = await cacheIGDBGames(supabase, external);
      return NextResponse.json({ items: games.map(game => ({ game } satisfies DiscoverItem)), hasMore: external.length === limit });
    }

    if (source === 'friends') {
      const [{ data: backlog, error: backlogError }, { data: favorites, error: favoritesError }] = await Promise.all([
        supabase.from('backlogs').select('created_at, user_id, games (*)').neq('user_id', user.id).order('created_at', { ascending: false }).limit(300),
        supabase.from('favorite_games').select('created_at, user_id, games (*)').neq('user_id', user.id).order('created_at', { ascending: false }).limit(300),
      ]);
      if (backlogError) throw backlogError;
      if (favoritesError) throw favoritesError;
      const rows = [...(backlog || []), ...(favorites || [])] as unknown as Array<{ created_at: string; user_id: string; games: Game }>;
      const profileIds = Array.from(new Set(rows.map(row => row.user_id)));
      const { data: profiles } = profileIds.length ? await supabase.from('profiles').select('id, name').in('id', profileIds) : { data: [] };
      const names = new Map((profiles || []).map(profile => [profile.id, profile.name || 'Membro']));
      const grouped = new Map<string, { game: Game; userIds: Set<string>; addedAt: string }>();
      rows.forEach(row => {
        const current = grouped.get(row.games.id) || { game: row.games, userIds: new Set<string>(), addedAt: row.created_at };
        current.userIds.add(row.user_id);
        if (row.created_at > current.addedAt) current.addedAt = row.created_at;
        grouped.set(row.games.id, current);
      });
      const items = Array.from(grouped.values())
        .filter(item => matchesFilters(item.game, query, genre, platform, year))
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
        .map(item => ({ game: item.game, activityCount: item.userIds.size, people: Array.from(item.userIds).map(id => names.get(id) || 'Membro'), addedAt: item.addedAt } satisfies DiscoverItem));
      return NextResponse.json({ items: items.slice(offset, offset + limit), hasMore: items.length > offset + limit });
    }

    const month = searchParams.get('month') || '';
    let votesQuery = supabase.from('votes').select('created_at, user_id, games (*)').order('created_at', { ascending: false }).limit(300);
    if (month) votesQuery = votesQuery.eq('vote_month', month);
    const { data: votes, error } = await votesQuery;
    if (error) throw error;
    const rows = (votes || []) as unknown as Array<{ created_at: string; user_id: string; games: Game }>;
    const grouped = new Map<string, { game: Game; userIds: Set<string>; addedAt: string }>();
    rows.forEach(row => {
      const current = grouped.get(row.games.id) || { game: row.games, userIds: new Set<string>(), addedAt: row.created_at };
      current.userIds.add(row.user_id);
      if (row.created_at < current.addedAt) current.addedAt = row.created_at;
      grouped.set(row.games.id, current);
    });
    const items = Array.from(grouped.values())
      .filter(item => matchesFilters(item.game, query, genre, platform, year))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      .map(item => ({ game: item.game, activityCount: item.userIds.size, addedAt: item.addedAt } satisfies DiscoverItem));
    return NextResponse.json({ items: items.slice(offset, offset + limit), hasMore: items.length > offset + limit });
  } catch (error) {
    console.error('Erro ao explorar jogos:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível carregar os jogos.' }, { status: 500 });
  }
}
