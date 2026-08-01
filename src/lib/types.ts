export interface Profile {
  id: string;
  name: string | null;
  email?: string | null;
  avatar_url: string | null;
  bio?: string | null;
  created_at?: string | null;
}

export type AppRole = 'member' | 'admin';

export interface ClubCycle {
  month: string;
  game_id: string;
  status: 'active' | 'closed';
  started_at?: string | null;
  closed_at?: string | null;
  selected_by?: string | null;
  game?: Game | null;
}

export type RewardKind = 'theme';

export interface ClubReward {
  id: string;
  club_month: string;
  code: string;
  kind: RewardKind;
  name: string;
  description: string | null;
  theme_id: string | null;
  image_url: string | null;
}

export interface RewardGrant {
  id: string;
  reward_id: string;
  granted_at: string;
  seen_at: string | null;
  reward: ClubReward & {
    cycle?: {
      month: string;
      game?: Pick<Game, 'title' | 'image_url'> | null;
    } | null;
  };
}

export interface AdminUser extends Profile {
  role: AppRole;
}

export interface Game {
  id: string;
  igdb_id?: number | null;
  title: string;
  duration_hours: number;
  average_rating?: number | null;
  release_year?: number | null;
  image_url: string;
  description: string;
  screenshot_urls?: string[] | null;
  trailer_url?: string | null;
  genres?: string[] | null;
  platforms?: string[] | null;
  platform_ids?: number[] | null;
}

export interface UserPlatform {
  id?: string;
  user_id?: string;
  igdb_platform_id: number;
  name: string;
  abbreviation?: string | null;
  logo_url?: string | null;
}

export interface RankingItem {
  game: Game;
  addedAt: string;
  choiceCounts: Record<VoteChoice, number>;
  choiceProfiles: Record<VoteChoice, VoteParticipant[]>;
  myChoice: VoteChoice | null;
  myReason?: VoteReason | null;
  myReasonText?: string | null;
  votesCount: number;
  completedCount: number;
  voters: Profile[];
  completedBy: Profile[];
  playtimePoints: number;
  ratingMultiplier: number;
  totalPoints: number;
  legacyTotalPoints: number;
  votedByMe: boolean;
  completedByMe: boolean;
  inBacklog: boolean;
}

export type VoteChoice = 'would_play' | 'would_not_play';
export type VoteReason = 'played_before' | 'cannot_run' | 'too_expensive' | 'other';

export interface VoteParticipant extends Profile {
  reason?: VoteReason | null;
  reasonText?: string | null;
}
export type RankingFormula = 'preference' | 'legacy';

export type DiscoverSource = 'popular' | 'rated' | 'recent' | 'anticipated' | 'friends' | 'ranking';

export interface DiscoverItem {
  game: Game;
  activityCount?: number;
  people?: string[];
  addedAt?: string | null;
}

export interface ProfileWithGames {
  profile: Profile | null;
  backlog: Game[];
  completed: Game[];
  favorites: Game[];
  library: LibraryGame[];
  votedGameIds: string[];
  rankingGameIds: string[];
  platforms: UserPlatform[];
}

export type ProgressStatus = 'not_started' | 'started' | 'finished';
export type RatingMode = 'simple' | 'detailed';
export type RatingCriterion = 'graphics' | 'gameplay' | 'story' | 'music' | 'fun';
export type RatingDetails = Partial<Record<RatingCriterion, number | null>>;

export interface GameProgress {
  id: string;
  user_id: string;
  game_id: string;
  status: ProgressStatus;
  rating: number | null;
  rating_mode?: RatingMode;
  rating_details?: RatingDetails | null;
  started_at: string | null;
  finished_at: string | null;
  profile?: Profile;
}

export interface LibraryGame {
  game: Game;
  inBacklog: boolean;
  favorite: boolean;
  progress: Pick<GameProgress, 'status' | 'rating' | 'rating_mode' | 'rating_details' | 'started_at' | 'finished_at'> | null;
  addedAt: string | null;
  updatedAt: string | null;
}

export interface CommentReaction {
  emoji: string;
  users: Profile[];
  reactedByMe: boolean;
}

export interface ClubComment {
  id: string;
  user_id: string;
  game_id: string;
  club_month: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  reactions: CommentReaction[];
  replies: ClubComment[];
}

export interface LocalNote {
  id: string;
  userId: string;
  gameId: string;
  body: string;
  imageDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}
