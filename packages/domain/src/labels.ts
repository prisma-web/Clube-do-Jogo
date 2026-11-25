import type { GotyCategorySection, GotyEventStatus } from './goty';
import type { LibraryQuickFilter, LibrarySortMode } from './library';
import type { AppRole, DiscoverSource, ProgressStatus, RatingCriterion, VoteChoice, VoteReason } from './types';

/**
 * User-facing names of domain concepts, shared by web and mobile.
 *
 * Each table is keyed by its union, so adding a member without a name is a
 * typecheck error. Only names live here: icons, colours, ordering and other
 * presentation stay in each app. Changing a value changes visible text on
 * every platform that reads it; `labels.test.ts` pins the current wording.
 */

export const voteChoiceLabels: Readonly<Record<VoteChoice, string>> = {
  would_play: 'Jogaria',
  neutral: 'Neutro',
  would_not_play: 'Não',
};

export const voteReasonLabels: Readonly<Record<VoteReason, string>> = {
  played_before: 'Já joguei e não quero de novo',
  cannot_run: 'Não consigo rodar',
  too_expensive: 'Muito caro',
  other: 'Outro',
};

/** Shown in place of a reason when a negative vote has none (or an unknown one). */
export const missingVoteReasonLabel = 'Sem motivo informado';

export function voteReasonLabel(reason?: VoteReason | null): string {
  return reason && Object.prototype.hasOwnProperty.call(voteReasonLabels, reason)
    ? voteReasonLabels[reason]
    : missingVoteReasonLabel;
}

/** A single game's progress (status pill, progress buttons, list group titles). */
export const progressStatusLabels: Readonly<Record<ProgressStatus, string>> = {
  not_started: 'Não iniciado',
  started: 'Comecei',
  finished: 'Finalizado',
};

/** Meus Jogos quick filter chips; these name groups of games, so some are plural. */
export const libraryQuickFilterLabels: Readonly<Record<LibraryQuickFilter, string>> = {
  all: 'Todos',
  started: 'Comecei',
  finished: 'Finalizados',
  not_started: 'Não iniciados',
  favorites: 'Favoritos',
};

export const librarySortModeLabels: Readonly<Record<LibrarySortMode, string>> = {
  updated_desc: 'Atualizados recentemente',
  updated_asc: 'Atualizados há mais tempo',
  title_asc: 'Título: A–Z',
  title_desc: 'Título: Z–A',
  duration_asc: 'Menor duração',
  duration_desc: 'Maior duração',
  rating_desc: 'Maior nota',
  rating_asc: 'Menor nota',
};

/** Discover sources a member can pick in Explorar; `friends` and `ranking` are internal feeds with no chip. */
export type CatalogDiscoverSource = Exclude<DiscoverSource, 'friends' | 'ranking'>;

export const discoverSourceLabels: Readonly<Record<CatalogDiscoverSource, string>> = {
  popular: 'Populares',
  rated: 'Melhores notas',
  recent: 'Lançamentos',
  anticipated: 'Em breve',
};

export const ratingCriterionLabels: Readonly<Record<RatingCriterion, string>> = {
  graphics: 'Gráficos',
  gameplay: 'Gameplay',
  story: 'História',
  music: 'Música',
  fun: 'Diversão',
};

export const appRoleLabels: Readonly<Record<AppRole, string>> = {
  admin: 'Admin',
  member: 'Usuário comum',
};

export const gotyCategorySectionLabels: Readonly<Record<GotyCategorySection, string>> = {
  main: 'Principais',
  craft: 'Arte & Técnica',
  genre: 'Gêneros',
  community_esports: 'Comunidade & Esports',
};

/** Bolão GOTY status, with the one-line explanation shown under it in the admin picker. */
export const gotyEventStatusLabels: Readonly<Record<GotyEventStatus, { readonly label: string; readonly description: string }>> = {
  open: { label: 'Aberto', description: 'Aceita votos' },
  locked: { label: 'Encerrado', description: 'Bloqueia edição' },
  results_published: { label: 'Apurado', description: 'Resultados finais' },
};
