import {
  demoGames,
  demoMonths,
  demoProfiles,
  demoProgress,
  demoRanking,
} from '@clube-do-jogo/domain/demo';
import { compareRankingItems, legacyRankingScore, preferenceRankingScore } from '@clube-do-jogo/domain';
import type {
  AppRole,
  ClubCycle,
  DiscoverItem,
  DiscoverSource,
  Game,
  GameMugshot,
  GameProgress,
  LibraryGame,
  Profile,
  ProfileWithGames,
  RankingItem,
  RankingFormula,
  RatingDetails,
  RatingMode,
  UserPlatform,
  VoteChoice,
  VoteReason,
} from '@clube-do-jogo/domain';
import type { DiscoveryFilters } from './client';
import type { ProfilePatch, UserPlatformInput } from './profiles';

type DemoVote = {
  choice: VoteChoice;
  reason: VoteReason | null;
  reasonText: string | null;
};

function key(userId: string, gameId: string) {
  return `${userId}:${gameId}`;
}

function cloneProfile(profile: Profile): Profile {
  return { ...profile, avatar_crop: profile.avatar_crop ? { ...profile.avatar_crop } : profile.avatar_crop };
}

function cloneRankingItem(item: RankingItem): RankingItem {
  return {
    ...item,
    game: { ...item.game },
    choiceCounts: { ...item.choiceCounts },
    choiceProfiles: {
      would_play: item.choiceProfiles.would_play.map(cloneProfile),
      would_not_play: item.choiceProfiles.would_not_play.map(profile => ({ ...profile })),
    },
    voters: item.voters.map(cloneProfile),
    completedBy: item.completedBy.map(cloneProfile),
  };
}

function cloneProgress(progress: GameProgress): GameProgress {
  return {
    ...progress,
    profile: progress.profile ? cloneProfile(progress.profile) : undefined,
    rating_details: progress.rating_details ? { ...progress.rating_details } : progress.rating_details,
  };
}

function demoUserProfile(userId: string) {
  return demoProfiles.find(profile => profile.id === userId) || demoProfiles[0];
}

const demoGenreTerms: Record<number, string[]> = {
  12: ['rpg', 'role-playing'],
  31: ['aventura', 'adventure'],
  32: ['indie'],
  8: ['plataforma', 'platform'],
  9: ['puzzle'],
  15: ['estratégia', 'strategy'],
  5: ['tiro', 'shooter'],
};

const demoPlatforms: UserPlatform[] = [
  { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch', logo_url: null },
  { igdb_platform_id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC', logo_url: null },
  { igdb_platform_id: 167, name: 'PlayStation 5', abbreviation: 'PS5', logo_url: null },
  { igdb_platform_id: 169, name: 'Xbox Series X|S', abbreviation: 'Xbox', logo_url: null },
];

export class DemoStore {
  private readonly voteOverrides = new Map<string, DemoVote | null>();
  private readonly progressOverrides = new Map<string, GameProgress>();
  private readonly backlogOverrides = new Map<string, boolean>();
  private readonly favoriteOverrides = new Map<string, boolean>();
  private readonly profileOverrides = new Map<string, Profile>();
  private readonly platformOverrides = new Map<string, UserPlatform[]>();

  private cycleOverrides: ClubCycle[] | null = null;
  private readonly roleOverrides = new Map<string, AppRole>();

  reset() {
    this.cycleOverrides = null;
    this.roleOverrides.clear();
    this.voteOverrides.clear();
    this.progressOverrides.clear();
    this.backlogOverrides.clear();
    this.favoriteOverrides.clear();
    this.profileOverrides.clear();
    this.platformOverrides.clear();
  }

  readProfile(profileId: string): Profile {
    return cloneProfile(this.profileOverrides.get(profileId) || demoUserProfile(profileId));
  }

  updateProfile(profileId: string, patch: ProfilePatch): Profile {
    const current = this.readProfile(profileId);
    const next = {
      ...current,
      ...patch,
      avatar_crop: patch.avatar_crop === undefined
        ? current.avatar_crop
        : patch.avatar_crop ? { ...patch.avatar_crop } : patch.avatar_crop,
    };
    this.profileOverrides.set(profileId, next);
    return cloneProfile(next);
  }

  readRole(userId: string): AppRole {
    return this.roleOverrides.get(userId) || (userId === demoProfiles[0].id ? 'admin' : 'member');
  }

  setRole(userId: string, role: AppRole): void {
    this.roleOverrides.set(userId, role);
  }

  setCycles(cycles: ClubCycle[]): void {
    this.cycleOverrides = cycles.map(cycle => ({ ...cycle, game: this.readGame(cycle.game_id) }));
  }

  readCycles(): ClubCycle[] {
    if (this.cycleOverrides) return this.cycleOverrides.map(cycle => ({ ...cycle, game: this.readGame(cycle.game_id) }));
    return demoMonths.map((month, index) => ({
      month,
      game_id: demoGames[0].id,
      status: index === 0 ? 'active' : 'closed',
      game: { ...demoGames[0] },
    }));
  }

  readRanking(userId: string, formula: RankingFormula = 'preference'): RankingItem[] {
    return demoRanking(formula).map(cloneRankingItem).map(item => {
      const override = this.voteOverrides.get(key(userId, item.game.id));
      if (override === undefined) {
        return { ...item, inBacklog: this.isBacklog(userId, item.game.id) };
      }

      const profiles = {
        would_play: item.choiceProfiles.would_play.filter(profile => profile.id !== userId),
        would_not_play: item.choiceProfiles.would_not_play.filter(profile => profile.id !== userId),
      };
      if (override) {
        profiles[override.choice].push({
          ...demoUserProfile(userId),
          reason: override.reason,
          reasonText: override.reasonText,
        });
      }
      const choiceCounts = {
        would_play: profiles.would_play.length,
        would_not_play: profiles.would_not_play.length,
      };
      const voters = [...profiles.would_play, ...profiles.would_not_play];
      const myChoice = override?.choice || null;
      const totalPoints = formula === 'legacy'
        ? legacyRankingScore(item.game, voters.length, item.completedCount)
        : preferenceRankingScore(choiceCounts);
      return {
        ...item,
        choiceCounts,
        choiceProfiles: profiles,
        myChoice,
        myReason: override?.reason || null,
        myReasonText: override?.reasonText || null,
        votesCount: voters.length,
        voters,
        totalPoints,
        legacyTotalPoints: legacyRankingScore(item.game, voters.length, item.completedCount),
        votedByMe: myChoice !== null,
        inBacklog: this.isBacklog(userId, item.game.id),
      };
    }).sort(compareRankingItems);
  }

  setVote(userId: string, gameId: string, vote: DemoVote | null) {
    this.voteOverrides.set(key(userId, gameId), vote);
  }

  readGame(gameId: string): Game | null {
    const game = demoGames.find(item => item.id === gameId) || demoGames[0];
    return game ? { ...game } : null;
  }

  readGameMugshots(_gameId: string): GameMugshot[] {
    return [];
  }

  searchPlatforms(query: string, _profileId: string): UserPlatform[] {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return demoPlatforms.map(platform => ({ ...platform }))
      .filter(platform => platform.name.toLocaleLowerCase('pt-BR').includes(normalized));
  }

  readUserPlatforms(profileId: string): UserPlatform[] {
    const platforms = this.platformOverrides.get(profileId) || demoPlatforms.slice(0, 2).map(platform => ({ ...platform, user_id: profileId }));
    return platforms.map(platform => ({ ...platform }));
  }

  setUserPlatform(userId: string, platform: UserPlatformInput) {
    const current = this.readUserPlatforms(userId);
    const next = [
      ...current.filter(item => item.igdb_platform_id !== platform.igdb_platform_id),
      { ...platform, user_id: userId },
    ].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
    this.platformOverrides.set(userId, next);
  }

  removeUserPlatform(userId: string, igdbPlatformId: number) {
    this.platformOverrides.set(userId, this.readUserPlatforms(userId)
      .filter(platform => platform.igdb_platform_id !== igdbPlatformId));
  }

  readProgress(userId: string, gameId: string): GameProgress[] {
    const base = demoProgress
      .map(progress => ({ ...progress, game_id: gameId }))
      .map(cloneProgress);
    const override = this.progressOverrides.get(key(userId, gameId));
    const withoutUser = base.filter(progress => progress.user_id !== userId);
    const ownProgress = override || base.find(progress => progress.user_id === userId);
    if (ownProgress) withoutUser.push(cloneProgress(ownProgress));
    return withoutUser;
  }

  currentProgress(userId: string, gameId: string): GameProgress | null {
    const override = this.progressOverrides.get(key(userId, gameId));
    if (override) return cloneProgress(override);
    const base = demoProgress.find(progress => progress.user_id === userId);
    return base ? { ...cloneProgress(base), game_id: gameId } : null;
  }

  setProgress(userId: string, gameId: string, progress: Pick<GameProgress, 'status' | 'rating' | 'rating_mode' | 'rating_details' | 'started_at' | 'finished_at'>) {
    this.progressOverrides.set(key(userId, gameId), {
      id: this.progressOverrides.get(key(userId, gameId))?.id || `demo-progress-${userId}-${gameId}`,
      user_id: userId,
      game_id: gameId,
      ...progress,
      profile: cloneProfile(demoUserProfile(userId)),
    });
  }

  setRating(userId: string, gameId: string, rating: number | null, ratingMode: RatingMode, ratingDetails: RatingDetails | null) {
    const current = this.currentProgress(userId, gameId);
    this.setProgress(userId, gameId, {
      status: current?.status || 'not_started',
      rating,
      rating_mode: ratingMode,
      rating_details: ratingDetails,
      started_at: current?.started_at || null,
      finished_at: current?.finished_at || null,
    });
  }

  readDiscoveryPage(_userId: string, source: DiscoverSource, filters: DiscoveryFilters, offset: number, limit: number): { items: DiscoverItem[]; hasMore: boolean } {
    let games = [...demoGames];
    const normalized = filters.search?.trim().toLocaleLowerCase('pt-BR') || '';
    if (normalized) {
      games = games.filter(game => [game.title, ...(game.genres || []), ...(game.platforms || [])]
        .some(value => value.toLocaleLowerCase('pt-BR').includes(normalized)));
    }
    if (filters.genre) {
      const terms = demoGenreTerms[filters.genre];
      if (terms) {
        games = games.filter(game => (game.genres || [])
          .some(genre => terms.some(term => genre.toLocaleLowerCase('pt-BR').includes(term))));
      }
    }
    if (filters.platform) games = games.filter(game => (game.platform_ids || []).includes(filters.platform as number));
    if (filters.year) games = games.filter(game => game.release_year === filters.year);
    if (source === 'popular' || source === 'rated') {
      games.sort((left, right) => Number(right.average_rating || 0) - Number(left.average_rating || 0));
    }
    if (source === 'recent' || source === 'anticipated') {
      games.sort((left, right) => Number(right.release_year || 0) - Number(left.release_year || 0));
    }
    let allItems: DiscoverItem[];
    if (source === 'friends') {
      allItems = games.map((game, index) => ({
        game,
        activityCount: 1 + index % 4,
        people: demoProfiles.slice(1, 2 + index % 3).map(profile => profile.name || 'Membro'),
      }));
    } else if (source === 'ranking') {
      allItems = games.map((game, index) => ({
        game,
        activityCount: 1 + index % 5,
        addedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
      }));
    } else {
      allItems = games.map(game => ({ game }));
    }
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(40, Math.max(1, Math.floor(limit))) : 24;
    const items = allItems.slice(safeOffset, safeOffset + safeLimit);
    return { items, hasMore: safeOffset + items.length < allItems.length };
  }

  isBacklog(userId: string, gameId: string) {
    const override = this.backlogOverrides.get(key(userId, gameId));
    return override ?? demoGames.slice(1, 6).some(game => game.id === gameId);
  }

  setBacklog(userId: string, gameId: string, inBacklog: boolean) {
    this.backlogOverrides.set(key(userId, gameId), inBacklog);
  }

  isFavorite(userId: string, gameId: string) {
    const override = this.favoriteOverrides.get(key(userId, gameId));
    return override ?? [demoGames[1], demoGames[3], demoGames[4]].some(game => game.id === gameId);
  }

  setFavorite(userId: string, gameId: string, favorite: boolean) {
    this.favoriteOverrides.set(key(userId, gameId), favorite);
  }

  readLibrary(profileId: string): ProfileWithGames {
    const initialProgress = demoGames.slice(6, 10).map((_game, index) => ({
      status: 'finished' as const,
      rating: 8.5,
      rating_mode: 'simple' as const,
      rating_details: null,
      started_at: new Date(Date.now() - (index + 12) * 86400000).toISOString(),
      finished_at: new Date(Date.now() - (index + 2) * 86400000).toISOString(),
    }));
    const games = demoGames.filter(game => this.isBacklog(profileId, game.id)
      || this.isFavorite(profileId, game.id)
      || Boolean(this.progressOverrides.get(key(profileId, game.id)))
      || demoGames.slice(6, 10).some(item => item.id === game.id));
    const library = games.map((game, index): LibraryGame => {
      const stored = this.progressOverrides.get(key(profileId, game.id));
      const completedIndex = demoGames.slice(6, 10).findIndex(item => item.id === game.id);
      const fallback = completedIndex >= 0
        ? initialProgress[completedIndex]
        : demoGames.slice(1, 6).some(item => item.id === game.id) && index % 3 === 0
          ? {
              status: 'started' as const,
              rating: null,
              rating_mode: 'simple' as const,
              rating_details: null,
              started_at: new Date(Date.now() - (index + 4) * 86400000).toISOString(),
              finished_at: null,
            }
          : null;
      return {
        game: { ...game },
        inBacklog: this.isBacklog(profileId, game.id),
        favorite: this.isFavorite(profileId, game.id),
        progress: stored || fallback,
        addedAt: new Date(Date.now() - index * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - index * 3600000).toISOString(),
      };
    });
    const ranking = this.readRanking(profileId);
    return {
      profile: this.readProfile(profileId),
      backlog: library.filter(item => item.inBacklog).map(item => item.game),
      completed: library.filter(item => item.progress?.status === 'finished').map(item => item.game),
      favorites: library.filter(item => item.favorite).map(item => item.game),
      library,
      votedGameIds: ranking.filter(item => item.votedByMe).map(item => item.game.id),
      rankingGameIds: ranking.map(item => item.game.id),
      platforms: this.readUserPlatforms(profileId),
    };
  }
}

export type { DemoVote };
