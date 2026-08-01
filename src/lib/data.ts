import type { SupabaseClient } from '@supabase/supabase-js';
import { demoGames, demoProfiles, demoRanking } from './demo-data';
import type { Game, LibraryGame, Profile, ProfileWithGames, ProgressStatus, RankingItem, RatingDetails, RatingMode, UserPlatform, VoteChoice, VoteParticipant, VoteReason } from './types';
import { ACTIVE_RANKING_FORMULA, compareRankingItems, legacyPlaytimePoints, legacyRankingScore, preferenceRankingScore, voteChoices } from './ranking';
import { shiftMonth } from './utils';

function fallbackProfile(id: string): Profile {
  return { id, name: 'Membro', avatar_url: null };
}

export async function fetchRankingData(supabase: SupabaseClient, votingMonth: string, userId: string, isDemo: boolean, historical = false): Promise<RankingItem[]> {
  if (isDemo) return demoRanking();
  const voteMonth = shiftMonth(votingMonth, 1);

  if (historical) {
    const { data: snapshots, error: snapshotError } = await supabase
      .from('ranking_snapshots')
      .select('*, games (*)')
      .eq('voting_month', votingMonth)
      .order('position');
    if (snapshotError) throw snapshotError;
    const snapshotRows = (snapshots || []) as unknown as Array<{
      game_id: string;
      vote_count: number;
      completed_count: number;
      voter_ids: string[];
      completed_user_ids: string[];
      playtime_points: number;
      rating_multiplier: number;
      total_points: number;
      finalized_at?: string;
      legacy_total_points?: number | null;
      would_play_count?: number;
      would_not_play_count?: number;
      would_play_user_ids?: string[];
      would_not_play_user_ids?: string[];
      games: Game;
    }>;
    const participantIds = Array.from(new Set(snapshotRows.flatMap(row => [
      ...(row.would_play_user_ids || row.voter_ids || []),
      ...(row.would_not_play_user_ids || []),
      ...(row.completed_user_ids || []),
    ])));
    let profiles: Profile[] = [];
    if (participantIds.length) {
      const response = await supabase.from('profiles').select('id, name, avatar_url').in('id', participantIds);
      if (response.error) throw response.error;
      profiles = response.data as Profile[];
    }
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const gameIds = snapshotRows.map(row => row.game_id);
    const { data: backlog } = gameIds.length
      ? await supabase.from('backlogs').select('game_id').eq('user_id', userId).in('game_id', gameIds)
      : { data: [] as Array<{ game_id: string }> };
    const backlogIds = new Set((backlog || []).map(item => item.game_id));
    return snapshotRows.map(row => {
      const choiceIds: Record<VoteChoice, string[]> = {
        would_play: row.would_play_user_ids || row.voter_ids || [],
        would_not_play: row.would_not_play_user_ids || [],
      };
      const choiceCounts: Record<VoteChoice, number> = {
        would_play: row.would_play_count ?? choiceIds.would_play.length,
        would_not_play: row.would_not_play_count ?? choiceIds.would_not_play.length,
      };
      const myChoice = voteChoices.find(choice => choiceIds[choice].includes(userId)) || null;
      const legacyTotalPoints = Number(row.legacy_total_points ?? row.total_points);
      return {
        game: row.games,
        addedAt: row.finalized_at || `${votingMonth}-01T00:00:00.000Z`,
        choiceCounts,
        choiceProfiles: Object.fromEntries(voteChoices.map(choice => [choice, choiceIds[choice].map(id => profileMap.get(id) || fallbackProfile(id))])) as Record<VoteChoice, VoteParticipant[]>,
        myChoice,
        votesCount: row.vote_count,
        completedCount: row.completed_count,
        voters: (row.voter_ids || []).map(id => profileMap.get(id) || fallbackProfile(id)),
        completedBy: (row.completed_user_ids || []).map(id => profileMap.get(id) || fallbackProfile(id)),
        playtimePoints: Number(row.playtime_points),
        ratingMultiplier: Number(row.rating_multiplier),
        totalPoints: ACTIVE_RANKING_FORMULA === 'legacy' ? legacyTotalPoints : preferenceRankingScore(choiceCounts),
        legacyTotalPoints,
        votedByMe: myChoice !== null,
        completedByMe: (row.completed_user_ids || []).includes(userId),
        inBacklog: backlogIds.has(row.game_id),
      };
    }).sort(compareRankingItems);
  }

  const { data: rawVotes, error: votesError } = await supabase.from('votes').select('game_id, user_id, choice, reason, reason_text, created_at').eq('vote_month', voteMonth);
  if (votesError) throw votesError;
  const votes = (rawVotes || []).filter(vote => vote.choice === 'would_play' || vote.choice === 'would_not_play');
  const gameIds = Array.from(new Set(votes.map(vote => vote.game_id)));
  if (!gameIds.length) return [];
  const [{ data: completed, error: completedError }, { data: games, error: gamesError }, { data: backlog, error: backlogError }] = await Promise.all([
    supabase.from('game_progress').select('game_id, user_id').eq('status', 'finished').in('game_id', gameIds),
    supabase.from('games').select('*').in('id', gameIds),
    supabase.from('backlogs').select('game_id').eq('user_id', userId).in('game_id', gameIds),
  ]);
  if (completedError) throw completedError;
  if (gamesError) throw gamesError;
  if (backlogError) throw backlogError;
  const backlogIds = new Set((backlog || []).map(item => item.game_id));
  const participantIds = Array.from(new Set([...(votes || []).map(vote => vote.user_id), ...(completed || []).map(item => item.user_id)]));
  let profiles: Profile[] = [];
  if (participantIds.length) {
    const response = await supabase.from('profiles').select('id, name, avatar_url').in('id', participantIds);
    if (response.error) throw response.error;
    profiles = response.data as Profile[];
  }
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  return ((games || []) as Game[]).map(game => {
    const gameVotes = votes.filter(vote => vote.game_id === game.id);
    const gameCompleted = (completed || []).filter(item => item.game_id === game.id);
    const choiceProfiles = Object.fromEntries(voteChoices.map(choice => [choice, gameVotes
      .filter(vote => (vote.choice || 'would_play') === choice)
      .map(vote => ({ ...(profileMap.get(vote.user_id) || fallbackProfile(vote.user_id)), reason: vote.reason as VoteReason | null, reasonText: vote.reason_text as string | null }))])) as Record<VoteChoice, VoteParticipant[]>;
    const choiceCounts = Object.fromEntries(voteChoices.map(choice => [choice, choiceProfiles[choice].length])) as Record<VoteChoice, number>;
    const durationPoints = legacyPlaytimePoints(Number(game.duration_hours));
    const ratingMultiplier = Number(game.average_rating ?? 50) / 100;
    const legacyTotalPoints = legacyRankingScore(game, gameVotes.length, gameCompleted.length);
    const myVote = gameVotes.find(vote => vote.user_id === userId);
    const myChoice = myVote ? (myVote.choice || 'would_play') as VoteChoice : null;
    const addedAt = gameVotes.reduce((earliest, vote) => !earliest || vote.created_at < earliest ? vote.created_at : earliest, '');
    return {
      game,
      addedAt,
      choiceCounts,
      choiceProfiles,
      myChoice,
      myReason: (myVote?.reason as VoteReason | null) || null,
      myReasonText: myVote?.reason_text || null,
      votesCount: gameVotes.length,
      completedCount: gameCompleted.length,
      voters: gameVotes.map(vote => profileMap.get(vote.user_id) || fallbackProfile(vote.user_id)),
      completedBy: gameCompleted.map(item => profileMap.get(item.user_id) || fallbackProfile(item.user_id)),
      playtimePoints: durationPoints,
      ratingMultiplier,
      totalPoints: ACTIVE_RANKING_FORMULA === 'legacy' ? legacyTotalPoints : preferenceRankingScore(choiceCounts),
      legacyTotalPoints,
      votedByMe: myChoice !== null,
      completedByMe: gameCompleted.some(item => item.user_id === userId),
      inBacklog: backlogIds.has(game.id),
    };
  }).sort(compareRankingItems);
}

export async function fetchGame(supabase: SupabaseClient, gameId: string, isDemo: boolean): Promise<Game | null> {
  if (isDemo) return demoGames.find(game => game.id === gameId) || demoGames[0];
  const { data, error } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
  if (error) throw error;
  return data as Game | null;
}

export async function fetchGameOfMonth(supabase: SupabaseClient, month: string, isDemo: boolean): Promise<Game | null> {
  if (isDemo) return demoGames[0];
  const { data, error } = await supabase.from('club_months').select('game_id, games (*)').eq('month', month).maybeSingle();
  if (error) throw error;
  if (!data?.games) return null;
  return data.games as unknown as Game;
}

export async function fetchUserPlatforms(supabase: SupabaseClient, userId: string, isDemo: boolean): Promise<UserPlatform[]> {
  if (isDemo) return [
    { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
    { igdb_platform_id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
  ];
  const { data, error } = await supabase
    .from('user_platforms')
    .select('id, user_id, igdb_platform_id, name, abbreviation, logo_url')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return (data || []) as UserPlatform[];
}

export async function fetchProfileWithGames(supabase: SupabaseClient, profileId: string, isDemo: boolean, voteMonth?: string): Promise<ProfileWithGames> {
  if (isDemo) {
    const ranking = demoRanking();
    const backlog = demoGames.slice(1, 6);
    const completed = demoGames.slice(6, 10);
    const favorites = [demoGames[1], demoGames[3], demoGames[4]];
    const libraryGames = Array.from(new Map([...backlog, ...completed, ...favorites].map(game => [game.id, game])).values());
    return {
      profile: demoProfiles.find(profile => profile.id === profileId) || demoProfiles[0],
      backlog,
      completed,
      favorites,
      library: libraryGames.map((game, index): LibraryGame => ({
        game,
        inBacklog: backlog.some(item => item.id === game.id),
        favorite: favorites.some(item => item.id === game.id),
        progress: completed.some(item => item.id === game.id)
          ? { status: 'finished', rating: 8.5, rating_mode: 'simple', rating_details: null, started_at: new Date(Date.now() - (index + 12) * 86400000).toISOString(), finished_at: new Date(Date.now() - (index + 2) * 86400000).toISOString() }
          : backlog.some(item => item.id === game.id) && index % 3 === 0
            ? { status: 'started', rating: null, rating_mode: 'simple', rating_details: null, started_at: new Date(Date.now() - (index + 4) * 86400000).toISOString(), finished_at: null }
            : null,
        addedAt: new Date(Date.now() - index * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - index * 3600000).toISOString(),
      })),
      votedGameIds: ranking.filter(item => item.votedByMe).map(item => item.game.id),
      rankingGameIds: ranking.map(item => item.game.id),
      platforms: await fetchUserPlatforms(supabase, profileId, true),
    };
  }
  const [{ data: profile, error: profileError }, { data: backlog, error: backlogError }, { data: progress, error: progressError }, { data: favorites, error: favoritesError }, votesResponse, platforms] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase.from('backlogs').select('created_at, games (*)').eq('user_id', profileId).order('created_at', { ascending: false }),
    supabase.from('game_progress').select('status, rating, rating_mode, rating_details, started_at, finished_at, updated_at, games (*)').eq('user_id', profileId).order('updated_at', { ascending: false }),
    supabase.from('favorite_games').select('created_at, games (*)').eq('user_id', profileId).order('created_at', { ascending: false }),
    voteMonth ? supabase.from('votes').select('game_id, user_id').eq('vote_month', voteMonth) : Promise.resolve({ data: [], error: null }),
    fetchUserPlatforms(supabase, profileId, false),
  ]);
  if (profileError) throw profileError;
  if (backlogError) throw backlogError;
  if (progressError) throw progressError;
  if (favoritesError) throw favoritesError;
  if (votesResponse.error) throw votesResponse.error;
  const votes = votesResponse.data || [];
  const backlogGames = (backlog || []).map(item => item.games) as unknown as Game[];
  const progressRows = (progress || []) as unknown as Array<{
    status: ProgressStatus;
    rating: number | null;
    rating_mode: RatingMode;
    rating_details: RatingDetails | null;
    started_at: string | null;
    finished_at: string | null;
    updated_at: string;
    games: Game;
  }>;
  const favoriteGames = (favorites || []).map(item => item.games) as unknown as Game[];
  const gameMap = new Map<string, LibraryGame>();
  (backlog || []).forEach(row => {
    const game = row.games as unknown as Game;
    gameMap.set(game.id, { game, inBacklog: true, favorite: false, progress: null, addedAt: row.created_at, updatedAt: row.created_at });
  });
  progressRows.forEach(row => {
    const current = gameMap.get(row.games.id);
    gameMap.set(row.games.id, {
      game: row.games,
      inBacklog: current?.inBacklog || false,
      favorite: current?.favorite || false,
      progress: { status: row.status, rating: row.rating, rating_mode: row.rating_mode, rating_details: row.rating_details, started_at: row.started_at, finished_at: row.finished_at },
      addedAt: current?.addedAt || row.started_at || row.updated_at,
      updatedAt: row.updated_at,
    });
  });
  (favorites || []).forEach(row => {
    const game = row.games as unknown as Game;
    const current = gameMap.get(game.id);
    gameMap.set(game.id, { game, inBacklog: current?.inBacklog || false, favorite: true, progress: current?.progress || null, addedAt: current?.addedAt || row.created_at, updatedAt: current?.updatedAt || row.created_at });
  });
  return {
    profile: profile as Profile | null,
    backlog: backlogGames,
    completed: progressRows.filter(item => item.status === 'finished').map(item => item.games),
    favorites: favoriteGames,
    library: Array.from(gameMap.values()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    votedGameIds: votes.filter(item => item.user_id === profileId).map(item => item.game_id),
    rankingGameIds: Array.from(new Set(votes.map(item => item.game_id))),
    platforms,
  };
}
