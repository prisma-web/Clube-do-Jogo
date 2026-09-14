import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { ClubComment, CommentReaction, Profile } from '@clube-do-jogo/domain';
import { demoComments, demoProfiles } from '@clube-do-jogo/domain/demo';
import type { DataScope } from './client';
import { DataError, withDataErrors } from './errors';

export interface CommentsQuery extends DataScope {
  gameId: string;
  clubMonth: string;
}

export interface CommentInput extends CommentsQuery {
  parentId?: string | null;
  body: string;
  historical?: boolean;
}

export interface CommentUpdateInput extends CommentsQuery {
  commentId: string;
  body: string;
  expectedUpdatedAt: string;
  historical?: boolean;
}

export interface CommentDeleteInput extends CommentsQuery {
  commentId: string;
  expectedUpdatedAt?: string;
  historical?: boolean;
}

export interface CommentReactionInput extends CommentsQuery {
  commentId: string;
  emoji: string;
  enabled: boolean;
  historical?: boolean;
}

export interface CommentRealtimeEvent {
  table: 'club_comments' | 'comment_reactions';
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string | null;
  key: string;
  clubMonth: string | null;
}

export interface CommentsSubscriptionOptions extends CommentsQuery {
  onEvent(event: CommentRealtimeEvent): void;
  onStatus?(status: string): void;
}

export interface CommentsClient {
  read(input: CommentsQuery): Promise<ClubComment[]>;
  create(input: CommentInput): Promise<ClubComment>;
  update(input: CommentUpdateInput): Promise<ClubComment>;
  remove(input: CommentDeleteInput): Promise<void>;
  setReaction(input: CommentReactionInput): Promise<void>;
  subscribe(input: CommentsSubscriptionOptions): () => void;
  readComments(input: CommentsQuery): Promise<ClubComment[]>;
  createComment(input: CommentInput): Promise<ClubComment>;
  updateComment(input: CommentUpdateInput): Promise<ClubComment>;
  deleteComment(input: CommentDeleteInput): Promise<void>;
}

type RawComment = {
  id: string;
  user_id: string;
  game_id: string;
  club_month: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

type RawReaction = {
  id?: string;
  comment_id: string;
  user_id: string;
  game_id: string;
  club_month: string;
  emoji: string;
  created_at?: string;
};

type Row = Record<string, unknown>;

function fallbackProfile(userId: string): Profile {
  return { id: userId, name: 'Membro', avatar_url: null };
}

function cloneProfile(profile: Profile): Profile {
  return {
    ...profile,
    avatar_crop: profile.avatar_crop ? { ...profile.avatar_crop } : profile.avatar_crop,
  };
}

function cloneComment(comment: ClubComment): ClubComment {
  return {
    ...comment,
    profile: comment.profile ? cloneProfile(comment.profile) : comment.profile,
    reactions: comment.reactions.map(reaction => ({
      ...reaction,
      users: reaction.users.map(cloneProfile),
    })),
    replies: comment.replies.map(cloneComment),
  };
}

function keyFor(gameId: string, clubMonth: string) {
  return `${gameId}:${clubMonth}`;
}

function randomId(prefix: string) {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateScope(input: CommentsQuery, operation: string) {
  if (!input || typeof input !== 'object') throw new DataError(operation, 'O contexto da conversa é inválido.');
  if (typeof input.userId !== 'string' || !input.userId.trim()) throw new DataError(operation, 'A conta não foi informada.');
  if (typeof input.gameId !== 'string' || !input.gameId.trim()) throw new DataError(operation, 'O jogo não foi informado.');
  if (typeof input.clubMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.clubMonth)) {
    throw new DataError(operation, 'O ciclo informado é inválido.');
  }
}

function requireLive(historical: boolean | undefined, operation: string) {
  if (historical) throw new DataError(operation, 'O histórico é somente leitura.');
}

function normalizeBody(body: unknown, operation: string) {
  if (typeof body !== 'string') throw new DataError(operation, 'O comentário é inválido.');
  const value = body.trim();
  if (!value || value.length > 4000) throw new DataError(operation, 'O comentário deve ter entre 1 e 4000 caracteres.');
  return value;
}

function normalizeEmoji(emoji: unknown, operation: string) {
  if (typeof emoji !== 'string') throw new DataError(operation, 'A reação é inválida.');
  const value = emoji.trim();
  if (!value || value.length > 32) throw new DataError(operation, 'A reação é inválida.');
  return value;
}

function rawComment(value: unknown): RawComment | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<RawComment>;
  if (typeof row.id !== 'string' || typeof row.user_id !== 'string' || typeof row.game_id !== 'string'
    || typeof row.club_month !== 'string' || (row.parent_id !== null && typeof row.parent_id !== 'string')
    || typeof row.body !== 'string' || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') return null;
  return {
    id: row.id,
    user_id: row.user_id,
    game_id: row.game_id,
    club_month: row.club_month,
    parent_id: row.parent_id,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rawReaction(value: unknown): RawReaction | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<RawReaction>;
  if (typeof row.comment_id !== 'string' || typeof row.user_id !== 'string' || typeof row.game_id !== 'string'
    || typeof row.club_month !== 'string' || typeof row.emoji !== 'string') return null;
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    comment_id: row.comment_id,
    user_id: row.user_id,
    game_id: row.game_id,
    club_month: row.club_month,
    emoji: row.emoji,
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
  };
}

function profileFromRow(value: unknown): Profile | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<Profile>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string' && row.name !== null || typeof row.avatar_url !== 'string' && row.avatar_url !== null) return null;
  return {
    id: row.id,
    name: row.name,
    avatar_url: row.avatar_url,
    avatar_crop: row.avatar_crop,
  };
}

function orderComments(left: ClubComment, right: ClubComment) {
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}

function mapComments(
  rows: RawComment[],
  reactions: RawReaction[],
  profiles: Profile[],
  userId: string,
  gameId: string,
  clubMonth: string,
) {
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const reactionsByComment = new Map<string, Map<string, Profile[]>>();
  reactions
    .filter(reaction => reaction.game_id === gameId && reaction.club_month === clubMonth)
    .forEach(reaction => {
      const byEmoji = reactionsByComment.get(reaction.comment_id) || new Map<string, Profile[]>();
      const people = byEmoji.get(reaction.emoji) || [];
      if (!people.some(person => person.id === reaction.user_id)) {
        people.push(cloneProfile(profilesById.get(reaction.user_id) || fallbackProfile(reaction.user_id)));
      }
      byEmoji.set(reaction.emoji, people);
      reactionsByComment.set(reaction.comment_id, byEmoji);
    });

  const commentsById = new Map<string, ClubComment>();
  rows
    .filter(row => row.game_id === gameId && row.club_month === clubMonth)
    .forEach(row => {
      const commentReactions = Array.from(reactionsByComment.get(row.id)?.entries() || [])
        .map(([emoji, users]): CommentReaction => ({
          emoji,
          users,
          reactedByMe: users.some(person => person.id === userId),
        }));
      commentsById.set(row.id, {
        ...row,
        profile: cloneProfile(profilesById.get(row.user_id) || fallbackProfile(row.user_id)),
        reactions: commentReactions,
        replies: [],
      });
    });

  const roots: ClubComment[] = [];
  for (const comment of commentsById.values()) {
    const parent = comment.parent_id ? commentsById.get(comment.parent_id) : undefined;
    if (parent && parent.id !== comment.id) parent.replies.push(comment);
    else roots.push(comment);
  }
  const sortTree = (items: ClubComment[]) => {
    items.sort(orderComments);
    items.forEach(item => sortTree(item.replies));
  };
  sortTree(roots);
  return roots;
}

async function authenticatedClient(supabase: SupabaseClient, userId: string, operation: string) {
  const auth = supabase.auth;
  if (!auth) throw new DataError(operation, 'Configure o Supabase para acessar a conversa.');
  const { data, error } = await auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== userId) throw new DataError(operation, 'Sua sessão não está autorizada para essa operação.');
  return supabase;
}

async function readRemote(
  supabase: SupabaseClient,
  input: CommentsQuery,
) {
  const client = await authenticatedClient(supabase, input.userId, 'ler comentários');
  const [{ data: commentRows, error: commentsError }, { data: reactionRows, error: reactionsError }] = await Promise.all([
    client.from('club_comments').select('*').eq('game_id', input.gameId).eq('club_month', input.clubMonth).order('created_at', { ascending: true }),
    client.from('comment_reactions').select('id, comment_id, user_id, game_id, club_month, emoji, created_at').eq('game_id', input.gameId).eq('club_month', input.clubMonth).order('created_at', { ascending: true }),
  ]);
  if (commentsError) throw commentsError;
  if (reactionsError) throw reactionsError;
  const comments = (commentRows || []).map(rawComment).filter((row): row is RawComment => Boolean(row));
  const reactions = (reactionRows || []).map(rawReaction).filter((row): row is RawReaction => Boolean(row));
  const profileIds = Array.from(new Set([
    ...comments.map(comment => comment.user_id),
    ...reactions.map(reaction => reaction.user_id),
  ]));
  const { data: profileRows, error: profilesError } = profileIds.length
    ? await client.from('profiles').select('id, name, avatar_url, avatar_crop').in('id', profileIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profiles = (profileRows || []).map(profileFromRow).filter((profile): profile is Profile => Boolean(profile));
  return mapComments(comments, reactions, profiles, input.userId, input.gameId, input.clubMonth);
}

function mapReturnedComment(value: unknown, input: CommentsQuery, operation: string): ClubComment {
  const row = rawComment(value);
  if (!row || row.id === '' || row.user_id !== input.userId || row.game_id !== input.gameId || row.club_month !== input.clubMonth) {
    throw new DataError(operation, 'O servidor devolveu um comentário inválido.');
  }
  const profile = fallbackProfile(input.userId);
  return {
    ...row,
    profile,
    reactions: [],
    replies: [],
  };
}

async function readRemoteById(supabase: SupabaseClient, input: CommentsQuery, commentId: string) {
  const client = await authenticatedClient(supabase, input.userId, 'ler comentário');
  const { data, error } = await client.from('club_comments').select('*')
    .eq('id', commentId).eq('user_id', input.userId).eq('game_id', input.gameId).eq('club_month', input.clubMonth).maybeSingle();
  if (error) throw error;
  return rawComment(data);
}

class DemoCommentsStore {
  private readonly overrides = new Map<string, ClubComment[]>();

  private initial(input: CommentsQuery) {
    const seed = demoComments
      .filter(comment => comment.game_id === input.gameId)
      .map(comment => ({ ...cloneComment(comment), club_month: input.clubMonth }));
    return seed;
  }

  private current(input: CommentsQuery) {
    const key = keyFor(input.gameId, input.clubMonth);
    const value = this.overrides.get(key) || this.initial(input);
    if (!this.overrides.has(key)) this.overrides.set(key, value);
    return value;
  }

  read(input: CommentsQuery) {
    return this.current(input).map(cloneComment);
  }

  create(input: CommentInput) {
    const body = normalizeBody(input.body, 'publicar comentário');
    const items = this.current(input);
    const all = flatten(items);
    if (input.parentId && !all.some(comment => comment.id === input.parentId)) {
      throw new DataError('publicar comentário', 'A mensagem respondida não existe neste ciclo.');
    }
    const now = new Date().toISOString();
    const comment: ClubComment = {
      id: randomId('demo-comment'),
      user_id: input.userId,
      game_id: input.gameId,
      club_month: input.clubMonth,
      parent_id: input.parentId || null,
      body,
      created_at: now,
      updated_at: now,
      profile: cloneProfile(demoProfiles.find(profile => profile.id === input.userId) || fallbackProfile(input.userId)),
      reactions: [],
      replies: [],
    };
    if (comment.parent_id) {
      const parent = all.find(item => item.id === comment.parent_id);
      parent?.replies.push(comment);
    } else items.push(comment);
    return cloneComment(comment);
  }

  update(input: CommentUpdateInput) {
    const body = normalizeBody(input.body, 'editar comentário');
    const comment = flatten(this.current(input)).find(item => item.id === input.commentId && item.user_id === input.userId);
    if (!comment) throw new DataError('editar comentário', 'O comentário não foi encontrado.');
    if (comment.updated_at !== input.expectedUpdatedAt) throw new DataError('editar comentário', 'O comentário mudou. Atualize a conversa e tente novamente.');
    comment.body = body;
    comment.updated_at = new Date().toISOString();
    return cloneComment(comment);
  }

  remove(input: CommentDeleteInput) {
    const items = this.current(input);
    const target = flatten(items).find(item => item.id === input.commentId && item.user_id === input.userId);
    if (!target) return;
    if (input.expectedUpdatedAt && target.updated_at !== input.expectedUpdatedAt) throw new DataError('apagar comentário', 'O comentário mudou. Atualize a conversa e tente novamente.');
    const removeFrom = (list: ClubComment[]) => {
      for (let index = list.length - 1; index >= 0; index -= 1) {
        if (list[index].id === input.commentId) list.splice(index, 1);
        else removeFrom(list[index].replies);
      }
    };
    removeFrom(items);
  }

  setReaction(input: CommentReactionInput) {
    const emoji = normalizeEmoji(input.emoji, 'salvar reação');
    const target = flatten(this.current(input)).find(item => item.id === input.commentId);
    if (!target) throw new DataError('salvar reação', 'O comentário não foi encontrado.');
    const reaction = target.reactions.find(item => item.emoji === emoji);
    if (input.enabled) {
      if (!reaction && target.reactions.length >= 10) throw new DataError('salvar reação', 'Limite de 10 emojis diferentes atingido neste comentário.');
      if (reaction) {
        if (!reaction.users.some(user => user.id === input.userId)) reaction.users.push(cloneProfile(demoProfiles.find(profile => profile.id === input.userId) || fallbackProfile(input.userId)));
        reaction.reactedByMe = true;
      } else {
        target.reactions.push({ emoji, reactedByMe: true, users: [cloneProfile(demoProfiles.find(profile => profile.id === input.userId) || fallbackProfile(input.userId))] });
      }
    } else if (reaction) {
      reaction.users = reaction.users.filter(user => user.id !== input.userId);
      reaction.reactedByMe = false;
      target.reactions = target.reactions.filter(item => item.users.length > 0);
    }
  }
}

function flatten(items: ClubComment[]): ClubComment[] {
  return items.flatMap(item => [item, ...flatten(item.replies)]);
}

function eventFromPayload(
  table: 'club_comments' | 'comment_reactions',
  payload: RealtimePostgresChangesPayload<Row>,
  input: CommentsQuery,
): CommentRealtimeEvent | null {
  const eventType = payload.eventType;
  if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') return null;
  const row = (eventType === 'DELETE' ? payload.old : payload.new) as Row;
  if (!row || (typeof row.game_id === 'string' && row.game_id !== input.gameId)
    || (typeof row.club_month === 'string' && row.club_month !== input.clubMonth)
    || (eventType !== 'DELETE' && (typeof row.game_id !== 'string' || typeof row.club_month !== 'string'))) return null;
  const id = typeof (table === 'club_comments' ? row.id : row.comment_id) === 'string'
    ? (table === 'club_comments' ? row.id : row.comment_id) as string
    : null;
  if (!id) return null;
  const discriminator = table === 'comment_reactions'
    ? `${row.user_id || ''}:${row.emoji || ''}`
    : `${row.user_id || ''}:${row.parent_id || ''}`;
  const version = row.updated_at || row.created_at || row.id || row.comment_id || '';
  return {
    table,
    eventType,
    id,
    clubMonth: typeof row.club_month === 'string' ? row.club_month : input.clubMonth,
    key: `${table}:${eventType}:${id}:${discriminator}:${version}`,
  };
}

function subscribeRemote(supabase: SupabaseClient, input: CommentsSubscriptionOptions) {
  const seen = new Set<string>();
  let active = true;
  let channel: RealtimeChannel | null = null;
  const dispatch = (table: 'club_comments' | 'comment_reactions') => (payload: RealtimePostgresChangesPayload<Row>) => {
    if (!active) return;
    const event = eventFromPayload(table, payload, input);
    if (!event || seen.has(event.key)) return;
    seen.add(event.key);
    if (seen.size > 500) seen.delete(seen.values().next().value as string);
    input.onEvent(event);
  };
  channel = supabase
    .channel(`discussion:${input.gameId}:${input.clubMonth}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'club_comments', filter: `game_id=eq.${input.gameId}` }, dispatch('club_comments'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_reactions', filter: `game_id=eq.${input.gameId}` }, dispatch('comment_reactions'))
    .subscribe(status => {
      if (active) input.onStatus?.(status);
    });
  return () => {
    if (!active) return;
    active = false;
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
}

export function createCommentsClient(options: { supabase?: SupabaseClient | null; demo?: boolean } = {}): CommentsClient {
  const demo = options.demo === true;
  const demoStore = demo ? new DemoCommentsStore() : null;
  const read = (input: CommentsQuery) => {
    validateScope(input, 'ler comentários');
    if (demo) return Promise.resolve(demoStore!.read(input));
    if (!options.supabase) return Promise.reject(new DataError('ler comentários', 'Configure o Supabase para acessar a conversa.'));
    return withDataErrors('ler comentários', 'Não foi possível carregar a conversa.', () => readRemote(options.supabase as SupabaseClient, input));
  };
  const create = async (input: CommentInput) => {
    validateScope(input, 'publicar comentário');
    requireLive(input.historical, 'publicar comentário');
    if (input.parentId !== undefined && input.parentId !== null
      && (typeof input.parentId !== 'string' || !input.parentId.trim())) {
      throw new DataError('publicar comentário', 'A resposta não foi informada corretamente.');
    }
    if (demo) return demoStore!.create(input);
    if (!options.supabase) throw new DataError('publicar comentário', 'Configure o Supabase para acessar a conversa.');
    return withDataErrors('publicar comentário', 'Não foi possível publicar o comentário.', async () => {
      const body = normalizeBody(input.body, 'publicar comentário');
      const client = await authenticatedClient(options.supabase as SupabaseClient, input.userId, 'publicar comentário');
      const { data, error } = await client.from('club_comments').insert({
        user_id: input.userId,
        game_id: input.gameId,
        club_month: input.clubMonth,
        parent_id: input.parentId || null,
        body,
      }).select('*').single();
      if (error) throw error;
      return mapReturnedComment(data, input, 'publicar comentário');
    });
  };
  const update = async (input: CommentUpdateInput) => {
    validateScope(input, 'editar comentário');
    requireLive(input.historical, 'editar comentário');
    if (typeof input.commentId !== 'string' || !input.commentId.trim()
      || typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt.trim()) {
      throw new DataError('editar comentário', 'O comentário não foi informado.');
    }
    if (demo) return demoStore!.update(input);
    if (!options.supabase) throw new DataError('editar comentário', 'Configure o Supabase para acessar a conversa.');
    return withDataErrors('editar comentário', 'Não foi possível editar o comentário.', async () => {
      const body = normalizeBody(input.body, 'editar comentário');
      const client = await authenticatedClient(options.supabase as SupabaseClient, input.userId, 'editar comentário');
      const { data, error } = await client.from('club_comments').update({ body, updated_at: new Date().toISOString() })
        .eq('id', input.commentId).eq('user_id', input.userId).eq('game_id', input.gameId).eq('club_month', input.clubMonth)
        .eq('updated_at', input.expectedUpdatedAt).select('*').maybeSingle();
      if (error) throw error;
      if (data) return mapReturnedComment(data, input, 'editar comentário');
      const remote = await readRemoteById(options.supabase as SupabaseClient, input, input.commentId);
      if (remote) throw new DataError('editar comentário', 'O comentário mudou. Atualize a conversa e tente novamente.');
      throw new DataError('editar comentário', 'O comentário não foi encontrado.');
    });
  };
  const remove = async (input: CommentDeleteInput) => {
    validateScope(input, 'apagar comentário');
    requireLive(input.historical, 'apagar comentário');
    if (typeof input.commentId !== 'string' || !input.commentId.trim()) throw new DataError('apagar comentário', 'O comentário não foi informado.');
    if (demo) {
      demoStore!.remove(input);
      return;
    }
    if (!options.supabase) throw new DataError('apagar comentário', 'Configure o Supabase para acessar a conversa.');
    return withDataErrors('apagar comentário', 'Não foi possível apagar o comentário.', async () => {
      const client = await authenticatedClient(options.supabase as SupabaseClient, input.userId, 'apagar comentário');
      let query = client.from('club_comments').delete()
        .eq('id', input.commentId).eq('user_id', input.userId).eq('game_id', input.gameId).eq('club_month', input.clubMonth);
      if (input.expectedUpdatedAt) query = query.eq('updated_at', input.expectedUpdatedAt);
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (data || !input.expectedUpdatedAt) return;
      const remote = await readRemoteById(options.supabase as SupabaseClient, input, input.commentId);
      if (remote) throw new DataError('apagar comentário', 'O comentário mudou. Atualize a conversa e tente novamente.');
    });
  };
  const setReaction = async (input: CommentReactionInput) => {
    validateScope(input, 'salvar reação');
    requireLive(input.historical, 'salvar reação');
    if (typeof input.commentId !== 'string' || !input.commentId.trim() || typeof input.enabled !== 'boolean') {
      throw new DataError('salvar reação', 'A reação não foi informada.');
    }
    if (demo) {
      demoStore!.setReaction(input);
      return;
    }
    if (!options.supabase) throw new DataError('salvar reação', 'Configure o Supabase para acessar a conversa.');
    return withDataErrors('salvar reação', 'Não foi possível salvar a reação.', async () => {
      const emoji = normalizeEmoji(input.emoji, 'salvar reação');
      const client = await authenticatedClient(options.supabase as SupabaseClient, input.userId, 'salvar reação');
      if (input.enabled) {
        const { error } = await client.from('comment_reactions').insert({
          comment_id: input.commentId,
          user_id: input.userId,
          emoji,
          game_id: input.gameId,
          club_month: input.clubMonth,
        });
        if (error && error.code !== '23505') throw error;
        return;
      }
      const { error } = await client.from('comment_reactions').delete()
        .eq('comment_id', input.commentId).eq('user_id', input.userId).eq('emoji', emoji)
        .eq('game_id', input.gameId).eq('club_month', input.clubMonth);
      if (error) throw error;
    });
  };
  const subscribe = (input: CommentsSubscriptionOptions) => {
    validateScope(input, 'acompanhar comentários');
    if (demo || !options.supabase) return () => undefined;
    return subscribeRemote(options.supabase as SupabaseClient, input);
  };
  return {
    read,
    create,
    update,
    remove,
    setReaction,
    subscribe,
    readComments: read,
    createComment: create,
    updateComment: update,
    deleteComment: remove,
  };
}

export const createCommentsDataClient = createCommentsClient;

export function readComments(supabase: SupabaseClient, input: CommentsQuery) {
  return createCommentsClient({ supabase }).read(input);
}

export function createComment(supabase: SupabaseClient, input: CommentInput) {
  return createCommentsClient({ supabase }).create(input);
}

export function updateComment(supabase: SupabaseClient, input: CommentUpdateInput) {
  return createCommentsClient({ supabase }).update(input);
}

export function deleteComment(supabase: SupabaseClient, input: CommentDeleteInput) {
  return createCommentsClient({ supabase }).remove(input);
}

export function setCommentReaction(supabase: SupabaseClient, input: CommentReactionInput) {
  return createCommentsClient({ supabase }).setReaction(input);
}
