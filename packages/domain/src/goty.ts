import type { Game, Profile } from './types';

export type GotyEventStatus = 'open' | 'locked' | 'results_published';

export type GotyCategorySection = 'main' | 'craft' | 'genre' | 'community_esports';

export type GotyNomineeKind =
  | 'game'
  | 'performance'
  | 'adaptation'
  | 'creator'
  | 'esports_athlete'
  | 'esports_team'
  | 'user_creation';

export type GotyReleaseEligibility =
  | 'commercial_2026'
  | 'early_access_graduated_2026'
  | 'remake_remaster_2026'
  | 'standalone_expansion_2026'
  | 'manual_override'
  | 'ineligible';

export interface GotyEventConfig {
  edition_year: number;
  title: string;
  subtitle: string;
  status: GotyEventStatus;
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  personal_voting_open: boolean;
  ceremony_at: string | null;
  source_name: string;
  source_url: string;
  source_verified_at: string | null;
  updated_at?: string | null;
}

export interface GotyNominee {
  id: string;
  category_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  nominee_kind: GotyNomineeKind;
  game_query: string | null;
  igdb_id: number | null;
  game_id: string | null;
  image_url: string | null;
  display_order: number;
}

export interface GotyCategory {
  id: string;
  edition_year: number;
  slug: string;
  name: string;
  name_pt: string;
  description: string;
  section: GotyCategorySection;
  display_order: number;
  winner_nominee_id: string | null;
  winner_set_at: string | null;
  winner_set_by: string | null;
  nominees: GotyNominee[];
}

export interface GotyBolaoVote {
  id?: string;
  edition_year: number;
  user_id: string;
  category_id: string;
  nominee_id: string;
  updated_at: string;
}

export interface GotyBolaoSubmission {
  edition_year: number;
  user_id: string;
  confirmed_at: string | null;
  updated_at: string;
}

export interface GotyPersonalCategory {
  id: string;
  edition_year: number;
  slug: string;
  name: string;
  description: string;
  display_order: number;
}

export interface GotyPersonalPick {
  id?: string;
  edition_year: number;
  user_id: string;
  category_id: string;
  game_id: string | null;
  igdb_id: number | null;
  game_title: string;
  game_image_url: string | null;
  game_release_year: number | null;
  game_platforms: string[];
  game_genres: string[];
  release_eligibility: GotyReleaseEligibility;
  updated_at: string;
}

export interface GotySearchGameResult extends Game {
  release_eligibility: GotyReleaseEligibility;
  effective_release_year: number | null;
  effective_release_date: string | null;
  eligibility_label: string;
  is_eligible_2026: boolean;
}

export interface GotyBolaoProgress {
  answered: number;
  total: number;
  percent: number;
  isComplete: boolean;
  missingCategoryIds: string[];
}

export interface GotyLeaderboardEntry {
  rank: number;
  user_id: string;
  profile: Profile;
  correctCount: number;
  announcedCount: number;
  votedCount: number;
  totalCategories: number;
  accuracyPercent: number;
  hitGoty: boolean;
  confirmedAt: string | null;
}

export interface GotyCommunityGamePickDetail {
  user_id: string;
  profile: Profile;
  category_id: string;
  category_name: string;
  category_slug: string;
  updated_at: string;
}

export interface GotyCommunityGameSummary {
  key: string;
  game_id: string | null;
  igdb_id: number | null;
  title: string;
  image_url: string | null;
  release_year: number | null;
  platforms: string[];
  genres: string[];
  release_eligibility: GotyReleaseEligibility;
  totalPicks: number;
  uniqueMembersCount: number;
  gotyPicksCount: number;
  members: Profile[];
  categoryNames: string[];
  picks: GotyCommunityGamePickDetail[];
}

export interface GotyCommunityMemberShowcase {
  user_id: string;
  profile: Profile;
  picksCount: number;
  mainGotyPick: GotyPersonalPick | null;
  picksByCategoryId: Record<string, GotyPersonalPick>;
  picks: Array<{
    category: GotyPersonalCategory;
    pick: GotyPersonalPick;
  }>;
}

export interface GotyCommunityWall {
  topGames: GotyCommunityGameSummary[];
  memberShowcases: GotyCommunityMemberShowcase[];
  totalParticipants: number;
  totalPicks: number;
}

export interface GotyFullState {
  event: GotyEventConfig;
  categories: GotyCategory[];
  bolaoVotes: GotyBolaoVote[];
  bolaoSubmissions: GotyBolaoSubmission[];
  personalCategories: GotyPersonalCategory[];
  personalPicks: GotyPersonalPick[];
  profiles: Profile[];
}

export interface ReleaseDateCandidate {
  date?: number | null;
  y?: number | null;
  dateFormat?: number | null;
  statusName?: string | null;
}

export interface ReleaseEligibilityInput {
  gameType?: number | null;
  gameStatus?: number | null;
  versionParent?: number | null;
  firstReleaseDate?: number | null;
  releaseDates?: ReleaseDateCandidate[] | null;
}

export interface ReleaseEligibilityEvaluation {
  eligible: boolean;
  eligibility: GotyReleaseEligibility;
  effectiveYear: number | null;
  effectiveDate: string | null;
  label: string;
  reason: string;
}

const NON_COMMERCIAL_STATUS_TOKENS = [
  'early access',
  'early-access',
  'alpha',
  'beta',
  'offline',
  'cancelled',
  'canceled',
  'rumored',
  'delisted',
];

const EXCLUDED_GAME_TYPES = new Set([1, 2, 3, 5, 6, 7, 11, 12]);

// IGDB game_status legacy/current IDs for non-released states: 2=Alpha, 3=Beta, 4=Early Access, 5=Offline, 6=Cancelled, 7=Rumored, 8=Delisted
const NON_RELEASED_GAME_STATUSES = new Set([2, 3, 4, 5, 6, 7, 8]);

function isNonCommercialStatus(statusName?: string | null): boolean {
  if (!statusName) return false;
  const normalized = statusName.trim().toLowerCase();
  return NON_COMMERCIAL_STATUS_TOKENS.some(token => normalized.includes(token));
}

function isEarlyAccessStatus(statusName?: string | null): boolean {
  if (!statusName) return false;
  const normalized = statusName.trim().toLowerCase();
  return normalized.includes('early access') || normalized.includes('early-access');
}

function isFullReleaseStatus(statusName?: string | null): boolean {
  if (!statusName) return false;
  const normalized = statusName.trim().toLowerCase();
  return normalized.includes('full release') || normalized === 'released';
}

function unixSecondsToIsoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function unixSecondsToUtcYear(unixSeconds: number): number {
  return new Date(unixSeconds * 1000).getUTCFullYear();
}

export function evaluate2026ReleaseEligibility(
  input: ReleaseEligibilityInput,
  targetYear = 2026,
  nowTimestamp = Date.now(),
): ReleaseEligibilityEvaluation {
  if (input.versionParent != null) {
    return {
      eligible: false,
      eligibility: 'ineligible',
      effectiveYear: input.firstReleaseDate ? unixSecondsToUtcYear(input.firstReleaseDate) : null,
      effectiveDate: input.firstReleaseDate ? unixSecondsToIsoDate(input.firstReleaseDate) : null,
      label: 'Edição alternativa',
      reason: 'Edições alternativas, coletâneas e versões derivadas de um jogo base são excluídas.',
    };
  }

  if (input.gameType != null && EXCLUDED_GAME_TYPES.has(input.gameType)) {
    return {
      eligible: false,
      eligibility: 'ineligible',
      effectiveYear: input.firstReleaseDate ? unixSecondsToUtcYear(input.firstReleaseDate) : null,
      effectiveDate: input.firstReleaseDate ? unixSecondsToIsoDate(input.firstReleaseDate) : null,
      label: 'DLC / Port / Extra',
      reason: 'Apenas lançamentos comerciais completos, expansões standalone, remakes ou remasters são elegíveis.',
    };
  }

  const nowSeconds = Math.floor(nowTimestamp / 1000);
  const rawDates = (input.releaseDates || []).filter(entry => entry.dateFormat !== 7);

  const hasEarlyAccessBeforeTarget = rawDates.some(entry => {
    if (!isEarlyAccessStatus(entry.statusName)) return false;
    const year = entry.date != null ? unixSecondsToUtcYear(entry.date) : entry.y ?? null;
    return year !== null && year < targetYear;
  });

  const releasedDates = rawDates
    .filter(entry => !isNonCommercialStatus(entry.statusName))
    .map(entry => {
      const timestamp = typeof entry.date === 'number' ? entry.date : null;
      const year = timestamp !== null ? unixSecondsToUtcYear(timestamp) : (typeof entry.y === 'number' ? entry.y : null);
      return {
        timestamp,
        year,
        explicitFullRelease: isFullReleaseStatus(entry.statusName),
      };
    })
    .filter(entry => {
      if (entry.year === null) return false;
      if (entry.timestamp !== null && entry.timestamp > nowSeconds) return false;
      if (entry.timestamp === null && entry.year > new Date(nowTimestamp).getUTCFullYear()) return false;
      return true;
    });

  const explicitFullReleases = releasedDates.filter(entry => entry.explicitFullRelease);
  const commercialPool = explicitFullReleases.length > 0 ? explicitFullReleases : releasedDates;

  commercialPool.sort((left, right) => {
    if (left.timestamp !== null && right.timestamp !== null) return left.timestamp - right.timestamp;
    return (left.year ?? 9999) - (right.year ?? 9999);
  });

  const earliestCommercial = commercialPool[0];

  if (earliestCommercial && earliestCommercial.year !== null) {
    const effectiveYear = earliestCommercial.year;
    const effectiveDate = earliestCommercial.timestamp !== null ? unixSecondsToIsoDate(earliestCommercial.timestamp) : `${effectiveYear}`;

    if (effectiveYear !== targetYear) {
      return {
        eligible: false,
        eligibility: 'ineligible',
        effectiveYear,
        effectiveDate,
        label: `Lançado em ${effectiveYear}`,
        reason: `A data efetiva de lançamento comercial foi em ${effectiveYear}, fora de ${targetYear}.`,
      };
    }

    if (hasEarlyAccessBeforeTarget) {
      return {
        eligible: true,
        eligibility: 'early_access_graduated_2026',
        effectiveYear,
        effectiveDate,
        label: `Versão 1.0 em ${targetYear}`,
        reason: `Saiu do Acesso Antecipado para lançamento comercial completo em ${targetYear}.`,
      };
    }

    if (input.gameType === 8 || input.gameType === 9) {
      return {
        eligible: true,
        eligibility: 'remake_remaster_2026',
        effectiveYear,
        effectiveDate,
        label: input.gameType === 8 ? `Remake ${targetYear}` : `Remaster ${targetYear}`,
        reason: `Lançamento comercial de ${input.gameType === 8 ? 'remake' : 'remaster'} em ${targetYear}.`,
      };
    }

    if (input.gameType === 4 || input.gameType === 10) {
      return {
        eligible: true,
        eligibility: 'standalone_expansion_2026',
        effectiveYear,
        effectiveDate,
        label: `Expansão ${targetYear}`,
        reason: `Expansão independente lançada comercialmente em ${targetYear}.`,
      };
    }

    return {
      eligible: true,
      eligibility: 'commercial_2026',
      effectiveYear,
      effectiveDate,
      label: `Lançamento ${targetYear}`,
      reason: `Lançamento comercial confirmado em ${targetYear}.`,
    };
  }

  // Only Early Access / non-commercial dates exist so far
  if (rawDates.length > 0 && rawDates.every(entry => isNonCommercialStatus(entry.statusName))) {
    return {
      eligible: false,
      eligibility: 'ineligible',
      effectiveYear: null,
      effectiveDate: null,
      label: 'Acesso antecipado / Não lançado',
      reason: 'O jogo ainda não possui data efetiva de lançamento comercial completo.',
    };
  }

  // Fallback when IGDB omits release_dates array but provides first_release_date
  if (input.gameStatus != null && NON_RELEASED_GAME_STATUSES.has(input.gameStatus)) {
    return {
      eligible: false,
      eligibility: 'ineligible',
      effectiveYear: input.firstReleaseDate ? unixSecondsToUtcYear(input.firstReleaseDate) : null,
      effectiveDate: input.firstReleaseDate ? unixSecondsToIsoDate(input.firstReleaseDate) : null,
      label: 'Não lançado comercialmente',
      reason: 'Status na IGDB indica jogo em acesso antecipado, beta, alpha ou não lançado.',
    };
  }

  if (typeof input.firstReleaseDate === 'number') {
    if (input.firstReleaseDate > nowSeconds) {
      return {
        eligible: false,
        eligibility: 'ineligible',
        effectiveYear: unixSecondsToUtcYear(input.firstReleaseDate),
        effectiveDate: unixSecondsToIsoDate(input.firstReleaseDate),
        label: 'Ainda não lançado',
        reason: 'Data de lançamento futura (apenas anunciado).',
      };
    }
    const year = unixSecondsToUtcYear(input.firstReleaseDate);
    const iso = unixSecondsToIsoDate(input.firstReleaseDate);
    if (year === targetYear) {
      const eligibility: GotyReleaseEligibility =
        input.gameType === 8 || input.gameType === 9
          ? 'remake_remaster_2026'
          : input.gameType === 4 || input.gameType === 10
            ? 'standalone_expansion_2026'
            : 'commercial_2026';
      const label =
        eligibility === 'remake_remaster_2026'
          ? (input.gameType === 8 ? `Remake ${targetYear}` : `Remaster ${targetYear}`)
          : eligibility === 'standalone_expansion_2026'
            ? `Expansão ${targetYear}`
            : `Lançamento ${targetYear}`;
      return {
        eligible: true,
        eligibility,
        effectiveYear: year,
        effectiveDate: iso,
        label,
        reason: `Lançamento comercial em ${targetYear}.`,
      };
    }
    return {
      eligible: false,
      eligibility: 'ineligible',
      effectiveYear: year,
      effectiveDate: iso,
      label: `Lançado em ${year}`,
      reason: `Lançado originalmente em ${year}.`,
    };
  }

  return {
    eligible: false,
    eligibility: 'ineligible',
    effectiveYear: null,
    effectiveDate: null,
    label: 'Sem data confirmada',
    reason: 'Sem data efetiva de lançamento comercial registrada.',
  };
}

export function isBolaoVotingOpen(event: GotyEventConfig, now = new Date()): boolean {
  if (event.status !== 'open') return false;
  const nowMs = now.getTime();
  if (event.voting_opens_at) {
    const opensMs = new Date(event.voting_opens_at).getTime();
    if (!Number.isNaN(opensMs) && nowMs < opensMs) return false;
  }
  if (event.voting_closes_at) {
    const closesMs = new Date(event.voting_closes_at).getTime();
    if (!Number.isNaN(closesMs) && nowMs > closesMs) return false;
  }
  return true;
}

export function computeBolaoProgress(
  categories: readonly GotyCategory[],
  userVotes: readonly GotyBolaoVote[],
): GotyBolaoProgress {
  const votedCategoryIds = new Set(userVotes.map(vote => vote.category_id));
  const missingCategoryIds = categories
    .filter(category => !votedCategoryIds.has(category.id))
    .map(category => category.id);
  const total = categories.length;
  const answered = total - missingCategoryIds.length;
  const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
  return {
    answered,
    total,
    percent,
    isComplete: total > 0 && missingCategoryIds.length === 0,
    missingCategoryIds,
  };
}

export function computeBolaoLeaderboard(
  categories: readonly GotyCategory[],
  votes: readonly GotyBolaoVote[],
  submissions: readonly GotyBolaoSubmission[],
  profiles: readonly Profile[],
): GotyLeaderboardEntry[] {
  const winnersByCategory = new Map<string, string>();
  let gotyCategoryId: string | null = null;

  for (const category of categories) {
    if (category.slug === 'game-of-the-year') gotyCategoryId = category.id;
    if (category.winner_nominee_id) {
      winnersByCategory.set(category.id, category.winner_nominee_id);
    }
  }

  const announcedCount = winnersByCategory.size;
  const totalCategories = categories.length;
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  const submissionMap = new Map(submissions.map(item => [item.user_id, item]));
  const votesByUser = new Map<string, GotyBolaoVote[]>();

  for (const vote of votes) {
    const list = votesByUser.get(vote.user_id) || [];
    list.push(vote);
    votesByUser.set(vote.user_id, list);
  }

  const participantIds = new Set<string>([
    ...votesByUser.keys(),
    ...submissions.filter(item => item.confirmed_at).map(item => item.user_id),
  ]);

  const entries: Omit<GotyLeaderboardEntry, 'rank'>[] = [];
  for (const userId of participantIds) {
    const userVotes = votesByUser.get(userId) || [];
    let correctCount = 0;
    let hitGoty = false;

    for (const vote of userVotes) {
      const winnerId = winnersByCategory.get(vote.category_id);
      if (winnerId && winnerId === vote.nominee_id) {
        correctCount += 1;
        if (vote.category_id === gotyCategoryId) hitGoty = true;
      }
    }

    const profile = profileMap.get(userId) || {
      id: userId,
      name: 'Membro do Clube',
      avatar_url: null,
    };

    const accuracyPercent = announcedCount > 0 ? Math.round((correctCount / announcedCount) * 100) : 0;

    entries.push({
      user_id: userId,
      profile,
      correctCount,
      announcedCount,
      votedCount: userVotes.length,
      totalCategories,
      accuracyPercent,
      hitGoty,
      confirmedAt: submissionMap.get(userId)?.confirmed_at ?? null,
    });
  }

  entries.sort((left, right) => {
    if (right.correctCount !== left.correctCount) return right.correctCount - left.correctCount;
    if (left.hitGoty !== right.hitGoty) return left.hitGoty ? -1 : 1;
    if (right.votedCount !== left.votedCount) return right.votedCount - left.votedCount;
    if (left.confirmedAt && right.confirmedAt) return left.confirmedAt.localeCompare(right.confirmedAt);
    if (left.confirmedAt) return -1;
    if (right.confirmedAt) return 1;
    return (left.profile.name || '').localeCompare(right.profile.name || '', 'pt-BR');
  });

  let currentRank = 0;
  let lastScoreKey = '';

  return entries.map((entry, index) => {
    const scoreKey = `${entry.correctCount}:${entry.hitGoty ? 1 : 0}`;
    if (scoreKey !== lastScoreKey) {
      currentRank = index + 1;
      lastScoreKey = scoreKey;
    }
    return {
      ...entry,
      rank: currentRank,
    };
  });
}

function normalizeGameKey(pick: Pick<GotyPersonalPick, 'game_id' | 'igdb_id' | 'game_title'>): string {
  if (pick.igdb_id) return `igdb:${pick.igdb_id}`;
  if (pick.game_id) return `game:${pick.game_id}`;
  return `title:${pick.game_title.trim().toLocaleLowerCase('pt-BR')}`;
}

export function computePersonalCommunityWall(
  picks: readonly GotyPersonalPick[],
  categories: readonly GotyPersonalCategory[],
  profiles: readonly Profile[],
): GotyCommunityWall {
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  const mainCategory = categories.find(category => category.slug === 'meu-goty') || categories[0] || null;

  const groupedGames = new Map<string, {
    key: string;
    game_id: string | null;
    igdb_id: number | null;
    title: string;
    image_url: string | null;
    release_year: number | null;
    platforms: string[];
    genres: string[];
    release_eligibility: GotyReleaseEligibility;
    memberIds: Set<string>;
    categoryNames: Set<string>;
    gotyPicksCount: number;
    picks: GotyCommunityGamePickDetail[];
  }>();

  const groupedMembers = new Map<string, GotyPersonalPick[]>();

  for (const pick of picks) {
    const category = categoryMap.get(pick.category_id);
    if (!category) continue;

    const profile = profileMap.get(pick.user_id) || {
      id: pick.user_id,
      name: 'Membro do Clube',
      avatar_url: null,
    };

    const userPicks = groupedMembers.get(pick.user_id) || [];
    userPicks.push(pick);
    groupedMembers.set(pick.user_id, userPicks);

    const key = normalizeGameKey(pick);
    const existing = groupedGames.get(key) || {
      key,
      game_id: pick.game_id,
      igdb_id: pick.igdb_id,
      title: pick.game_title,
      image_url: pick.game_image_url,
      release_year: pick.game_release_year,
      platforms: pick.game_platforms || [],
      genres: pick.game_genres || [],
      release_eligibility: pick.release_eligibility,
      memberIds: new Set<string>(),
      categoryNames: new Set<string>(),
      gotyPicksCount: 0,
      picks: [],
    };

    if (!existing.image_url && pick.game_image_url) existing.image_url = pick.game_image_url;
    if (!existing.game_id && pick.game_id) existing.game_id = pick.game_id;
    existing.memberIds.add(pick.user_id);
    existing.categoryNames.add(category.name);
    if (mainCategory && category.id === mainCategory.id) existing.gotyPicksCount += 1;
    existing.picks.push({
      user_id: pick.user_id,
      profile,
      category_id: category.id,
      category_name: category.name,
      category_slug: category.slug,
      updated_at: pick.updated_at,
    });

    groupedGames.set(key, existing);
  }

  const topGames: GotyCommunityGameSummary[] = Array.from(groupedGames.values())
    .map(entry => ({
      key: entry.key,
      game_id: entry.game_id,
      igdb_id: entry.igdb_id,
      title: entry.title,
      image_url: entry.image_url,
      release_year: entry.release_year,
      platforms: entry.platforms,
      genres: entry.genres,
      release_eligibility: entry.release_eligibility,
      totalPicks: entry.picks.length,
      uniqueMembersCount: entry.memberIds.size,
      gotyPicksCount: entry.gotyPicksCount,
      members: Array.from(entry.memberIds).map(id => profileMap.get(id) || { id, name: 'Membro do Clube', avatar_url: null }),
      categoryNames: Array.from(entry.categoryNames),
      picks: entry.picks.sort((left, right) => {
        const leftOrder = categoryMap.get(left.category_id)?.display_order ?? 99;
        const rightOrder = categoryMap.get(right.category_id)?.display_order ?? 99;
        return leftOrder - rightOrder || (left.profile.name || '').localeCompare(right.profile.name || '', 'pt-BR');
      }),
    }))
    .sort((left, right) => {
      if (right.uniqueMembersCount !== left.uniqueMembersCount) return right.uniqueMembersCount - left.uniqueMembersCount;
      if (right.totalPicks !== left.totalPicks) return right.totalPicks - left.totalPicks;
      if (right.gotyPicksCount !== left.gotyPicksCount) return right.gotyPicksCount - left.gotyPicksCount;
      return left.title.localeCompare(right.title, 'pt-BR');
    });

  const orderedCategories = [...categories].sort((a, b) => a.display_order - b.display_order);

  const memberShowcases: GotyCommunityMemberShowcase[] = Array.from(groupedMembers.entries())
    .map(([userId, userPicks]) => {
      const profile = profileMap.get(userId) || { id: userId, name: 'Membro do Clube', avatar_url: null };
      const picksByCategoryId: Record<string, GotyPersonalPick> = {};
      for (const pick of userPicks) {
        picksByCategoryId[pick.category_id] = pick;
      }
      const ordered = orderedCategories.flatMap(category => {
        const pick = picksByCategoryId[category.id];
        return pick ? [{ category, pick }] : [];
      });
      return {
        user_id: userId,
        profile,
        picksCount: ordered.length,
        mainGotyPick: mainCategory ? (picksByCategoryId[mainCategory.id] ?? null) : null,
        picksByCategoryId,
        picks: ordered,
      };
    })
    .sort((left, right) => {
      if (Boolean(right.mainGotyPick) !== Boolean(left.mainGotyPick)) return right.mainGotyPick ? 1 : -1;
      if (right.picksCount !== left.picksCount) return right.picksCount - left.picksCount;
      return (left.profile.name || '').localeCompare(right.profile.name || '', 'pt-BR');
    });

  return {
    topGames,
    memberShowcases,
    totalParticipants: memberShowcases.length,
    totalPicks: picks.length,
  };
}
