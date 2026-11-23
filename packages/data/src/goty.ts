import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createDemoGotyState,
  GOTY_2026_DEFAULT_EVENT,
  GOTY_2026_EDITION_YEAR,
  GOTY_2026_OFFICIAL_CATEGORIES,
  GOTY_2026_PERSONAL_CATEGORIES,
  isBolaoVotingOpen,
  type GotyBolaoSubmission,
  type GotyBolaoVote,
  type GotyCategory,
  type GotyEventConfig,
  type GotyEventStatus,
  type GotyFullState,
  type GotyNominee,
  type GotyPersonalCategory,
  type GotyPersonalPick,
  type GotySearchGameResult,
  type Profile,
} from '@clube-do-jogo/domain';
import { DataError, withDataErrors } from './errors';

const DEMO_STORAGE_KEY = 'clube-do-jogo:goty-2026:demo-state:v1';

export interface GotyScope {
  userId: string;
  isDemo: boolean;
  editionYear?: number;
}

export interface SaveBolaoVoteInput extends GotyScope {
  categoryId: string;
  nomineeId: string;
}

export interface ConfirmBolaoInput extends GotyScope {
  confirm: boolean;
}

export interface SavePersonalPickInput extends GotyScope {
  categoryId: string;
  game: GotySearchGameResult;
}

export interface ClearPersonalPickInput extends GotyScope {
  categoryId: string;
}

export interface AdminUpdateEventInput extends GotyScope {
  status?: GotyEventStatus;
  votingClosesAt?: string | null;
  personalVotingOpen?: boolean;
}

export interface AdminSetWinnerInput extends GotyScope {
  categoryId: string;
  winnerNomineeId: string | null;
}

function readDemoStorage(): GotyFullState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GotyFullState;
    if (!parsed || !Array.isArray(parsed.categories) || parsed.categories.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDemoStorage(state: GotyFullState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignora quota/modo privado
  }
}

let inMemoryDemoState: GotyFullState | null = null;

function cloneState(state: GotyFullState): GotyFullState {
  return JSON.parse(JSON.stringify(state)) as GotyFullState;
}

function loadDemoState(): GotyFullState {
  const fromStorage = readDemoStorage();
  if (fromStorage) {
    inMemoryDemoState = fromStorage;
    return cloneState(fromStorage);
  }
  if (!inMemoryDemoState) {
    inMemoryDemoState = createDemoGotyState();
  }
  return cloneState(inMemoryDemoState);
}

function persistDemoState(next: GotyFullState): GotyFullState {
  inMemoryDemoState = cloneState(next);
  writeDemoStorage(inMemoryDemoState);
  return cloneState(inMemoryDemoState);
}

export function resetDemoGotyState(): void {
  inMemoryDemoState = createDemoGotyState();
  writeDemoStorage(inMemoryDemoState);
}

function responseError(response: { error: unknown }): void {
  if (response.error) throw response.error;
}

export class GotyDataClient {
  private readonly supabase: SupabaseClient | null;

  constructor(supabase?: SupabaseClient | null) {
    this.supabase = supabase ?? null;
  }

  private client(operation: string): SupabaseClient {
    if (!this.supabase) {
      throw new DataError(operation, 'Configure o Supabase para sincronizar o GOTY 2026.');
    }
    return this.supabase;
  }

  async readFullState(scope: GotyScope): Promise<GotyFullState> {
    const editionYear = scope.editionYear ?? GOTY_2026_EDITION_YEAR;
    if (scope.isDemo) {
      return loadDemoState();
    }

    return withDataErrors('carregar dados do GOTY 2026', 'Não foi possível carregar o evento GOTY 2026.', async () => {
      const client = this.client('carregar dados do GOTY 2026');
      const [
        eventRes,
        categoriesRes,
        nomineesRes,
        votesRes,
        submissionsRes,
        personalCategoriesRes,
        personalPicksRes,
        profilesRes,
      ] = await Promise.all([
        client.from('goty_events').select('*').eq('edition_year', editionYear).maybeSingle(),
        client.from('goty_categories').select('*').eq('edition_year', editionYear).order('display_order', { ascending: true }),
        client.from('goty_nominees').select('*').eq('edition_year', editionYear).order('display_order', { ascending: true }),
        client.from('goty_bolao_votes').select('*').eq('edition_year', editionYear),
        client.from('goty_bolao_submissions').select('*').eq('edition_year', editionYear),
        client.from('goty_personal_categories').select('*').eq('edition_year', editionYear).order('display_order', { ascending: true }),
        client.from('goty_personal_picks').select('*').eq('edition_year', editionYear),
        client.from('profiles').select('id, name, avatar_url, avatar_crop, bio, created_at').order('name', { ascending: true }),
      ]);

      responseError(eventRes);
      responseError(categoriesRes);
      responseError(nomineesRes);
      responseError(votesRes);
      responseError(submissionsRes);
      responseError(personalCategoriesRes);
      responseError(personalPicksRes);
      responseError(profilesRes);

      const event: GotyEventConfig = (eventRes.data as GotyEventConfig | null) || { ...GOTY_2026_DEFAULT_EVENT };
      const rawCategories = (categoriesRes.data || []) as Omit<GotyCategory, 'nominees'>[];
      const rawNominees = (nomineesRes.data || []) as GotyNominee[];

      const nomineesByCategory = new Map<string, GotyNominee[]>();
      for (const nominee of rawNominees) {
        const list = nomineesByCategory.get(nominee.category_id) || [];
        list.push(nominee);
        nomineesByCategory.set(nominee.category_id, list);
      }

      const categories: GotyCategory[] = rawCategories.length > 0
        ? rawCategories.map(category => ({
            ...category,
            nominees: (nomineesByCategory.get(category.id) || []).sort((a, b) => a.display_order - b.display_order),
          }))
        : GOTY_2026_OFFICIAL_CATEGORIES;

      const personalCategories: GotyPersonalCategory[] = (personalCategoriesRes.data && personalCategoriesRes.data.length > 0)
        ? (personalCategoriesRes.data as GotyPersonalCategory[])
        : GOTY_2026_PERSONAL_CATEGORIES;

      return {
        event,
        categories,
        bolaoVotes: (votesRes.data || []) as GotyBolaoVote[],
        bolaoSubmissions: (submissionsRes.data || []) as GotyBolaoSubmission[],
        personalCategories,
        personalPicks: ((personalPicksRes.data || []) as GotyPersonalPick[]).map(pick => ({
          ...pick,
          game_platforms: Array.isArray(pick.game_platforms) ? pick.game_platforms : [],
          game_genres: Array.isArray(pick.game_genres) ? pick.game_genres : [],
        })),
        profiles: (profilesRes.data || []) as Profile[],
      };
    });
  }

  async saveBolaoVote(input: SaveBolaoVoteInput): Promise<GotyBolaoVote> {
    const editionYear = input.editionYear ?? GOTY_2026_EDITION_YEAR;
    const now = new Date().toISOString();

    if (input.isDemo) {
      const state = loadDemoState();
      if (!isBolaoVotingOpen(state.event)) {
        throw new DataError('salvar palpite do Bolão', 'O Bolão GOTY 2026 está encerrado para novas alterações.');
      }
      const nextVote: GotyBolaoVote = {
        id: `demo-bolao:${input.userId}:${input.categoryId}`,
        edition_year: editionYear,
        user_id: input.userId,
        category_id: input.categoryId,
        nominee_id: input.nomineeId,
        updated_at: now,
      };
      const existingIndex = state.bolaoVotes.findIndex(
        vote => vote.user_id === input.userId && vote.category_id === input.categoryId,
      );
      if (existingIndex >= 0) state.bolaoVotes[existingIndex] = nextVote;
      else state.bolaoVotes.push(nextVote);
      persistDemoState(state);
      return nextVote;
    }

    return withDataErrors('salvar palpite do Bolão', 'Não foi possível salvar seu palpite no Bolão.', async () => {
      const client = this.client('salvar palpite do Bolão');
      const { data, error } = await client
        .from('goty_bolao_votes')
        .upsert(
          {
            edition_year: editionYear,
            user_id: input.userId,
            category_id: input.categoryId,
            nominee_id: input.nomineeId,
            updated_at: now,
          },
          { onConflict: 'edition_year,user_id,category_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as GotyBolaoVote;
    });
  }

  async setBolaoConfirmation(input: ConfirmBolaoInput): Promise<GotyBolaoSubmission> {
    const editionYear = input.editionYear ?? GOTY_2026_EDITION_YEAR;
    const now = new Date().toISOString();
    const confirmedAt = input.confirm ? now : null;

    if (input.isDemo) {
      const state = loadDemoState();
      if (!isBolaoVotingOpen(state.event)) {
        throw new DataError('confirmar Bolão', 'O Bolão GOTY 2026 já foi encerrado.');
      }
      const submission: GotyBolaoSubmission = {
        edition_year: editionYear,
        user_id: input.userId,
        confirmed_at: confirmedAt,
        updated_at: now,
      };
      const existingIndex = state.bolaoSubmissions.findIndex(item => item.user_id === input.userId);
      if (existingIndex >= 0) state.bolaoSubmissions[existingIndex] = submission;
      else state.bolaoSubmissions.push(submission);
      persistDemoState(state);
      return submission;
    }

    return withDataErrors('confirmar Bolão', 'Não foi possível registrar a confirmação do seu Bolão.', async () => {
      const client = this.client('confirmar Bolão');
      const { data, error } = await client
        .from('goty_bolao_submissions')
        .upsert(
          {
            edition_year: editionYear,
            user_id: input.userId,
            confirmed_at: confirmedAt,
            updated_at: now,
          },
          { onConflict: 'edition_year,user_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as GotyBolaoSubmission;
    });
  }

  async savePersonalPick(input: SavePersonalPickInput): Promise<GotyPersonalPick> {
    const editionYear = input.editionYear ?? GOTY_2026_EDITION_YEAR;
    const now = new Date().toISOString();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.game.id);

    if (input.isDemo) {
      const state = loadDemoState();
      if (!state.event.personal_voting_open) {
        throw new DataError('salvar escolha no Seu GOTY', 'A edição do Seu GOTY 2026 está encerrada.');
      }
      const nextPick: GotyPersonalPick = {
        id: `demo-personal:${input.userId}:${input.categoryId}`,
        edition_year: editionYear,
        user_id: input.userId,
        category_id: input.categoryId,
        game_id: input.game.id,
        igdb_id: input.game.igdb_id ?? null,
        game_title: input.game.title,
        game_image_url: input.game.image_url,
        game_release_year: input.game.effective_release_year ?? input.game.release_year ?? 2026,
        game_platforms: input.game.platforms || [],
        game_genres: input.game.genres || [],
        release_eligibility: input.game.release_eligibility,
        updated_at: now,
      };
      const existingIndex = state.personalPicks.findIndex(
        pick => pick.user_id === input.userId && pick.category_id === input.categoryId,
      );
      if (existingIndex >= 0) state.personalPicks[existingIndex] = nextPick;
      else state.personalPicks.push(nextPick);
      persistDemoState(state);
      return nextPick;
    }

    return withDataErrors('salvar escolha no Seu GOTY', 'Não foi possível salvar sua escolha no Seu GOTY.', async () => {
      const client = this.client('salvar escolha no Seu GOTY');
      const { data, error } = await client
        .from('goty_personal_picks')
        .upsert(
          {
            edition_year: editionYear,
            user_id: input.userId,
            category_id: input.categoryId,
            game_id: isUuid ? input.game.id : null,
            igdb_id: input.game.igdb_id ?? null,
            game_title: input.game.title,
            game_image_url: input.game.image_url,
            game_release_year: input.game.effective_release_year ?? input.game.release_year ?? 2026,
            game_platforms: input.game.platforms || [],
            game_genres: input.game.genres || [],
            release_eligibility: input.game.release_eligibility,
            updated_at: now,
          },
          { onConflict: 'edition_year,user_id,category_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as GotyPersonalPick;
    });
  }

  async clearPersonalPick(input: ClearPersonalPickInput): Promise<void> {
    const editionYear = input.editionYear ?? GOTY_2026_EDITION_YEAR;

    if (input.isDemo) {
      const state = loadDemoState();
      state.personalPicks = state.personalPicks.filter(
        pick => !(pick.user_id === input.userId && pick.category_id === input.categoryId),
      );
      persistDemoState(state);
      return;
    }

    return withDataErrors('remover escolha do Seu GOTY', 'Não foi possível remover sua escolha.', async () => {
      const client = this.client('remover escolha do Seu GOTY');
      const { error } = await client
        .from('goty_personal_picks')
        .delete()
        .eq('edition_year', editionYear)
        .eq('user_id', input.userId)
        .eq('category_id', input.categoryId);
      if (error) throw error;
    });
  }

  async updateEventSettings(input: AdminUpdateEventInput): Promise<GotyEventConfig> {
    const editionYear = input.editionYear ?? GOTY_2026_EDITION_YEAR;

    if (input.isDemo) {
      const state = loadDemoState();
      state.event = {
        ...state.event,
        status: input.status ?? state.event.status,
        voting_closes_at: input.votingClosesAt !== undefined ? input.votingClosesAt : state.event.voting_closes_at,
        personal_voting_open: input.personalVotingOpen ?? state.event.personal_voting_open,
        updated_at: new Date().toISOString(),
      };
      persistDemoState(state);
      return state.event;
    }

    return withDataErrors('atualizar configurações do GOTY 2026', 'Não foi possível atualizar o estado do evento.', async () => {
      const client = this.client('atualizar configurações do GOTY 2026');
      const { data, error } = await client.rpc('set_goty_event_settings', {
        target_edition_year: editionYear,
        next_status: input.status ?? null,
        next_voting_closes_at: input.votingClosesAt === undefined ? null : input.votingClosesAt,
        clear_voting_closes_at: input.votingClosesAt === null,
        next_personal_voting_open: input.personalVotingOpen ?? null,
      });
      if (error) throw error;
      return data as GotyEventConfig;
    });
  }

  async setCategoryWinner(input: AdminSetWinnerInput): Promise<void> {
    const now = new Date().toISOString();

    if (input.isDemo) {
      const state = loadDemoState();
      state.categories = state.categories.map(category =>
        category.id === input.categoryId
          ? {
              ...category,
              winner_nominee_id: input.winnerNomineeId,
              winner_set_at: input.winnerNomineeId ? now : null,
              winner_set_by: input.winnerNomineeId ? input.userId : null,
            }
          : category,
      );
      persistDemoState(state);
      return;
    }

    return withDataErrors('registrar vencedor oficial', 'Não foi possível salvar o vencedor oficial da categoria.', async () => {
      const client = this.client('registrar vencedor oficial');
      const { error } = await client.rpc('set_goty_category_winner', {
        target_category_id: input.categoryId,
        target_winner_nominee_id: input.winnerNomineeId,
      });
      if (error) throw error;
    });
  }
}
