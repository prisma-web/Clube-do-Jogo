import type { GotyCategorySection, GotyEventStatus } from './goty';
import type { LibraryQuickFilter, LibrarySortMode } from './library';
import type { AppRole, DiscoverSource, ProgressStatus, RatingCriterion, VoteChoice, VoteReason } from './types';

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

export const missingVoteReasonLabel = 'Sem motivo informado';

export function voteReasonLabel(reason?: VoteReason | null): string {
  return reason && Object.prototype.hasOwnProperty.call(voteReasonLabels, reason)
    ? voteReasonLabels[reason]
    : missingVoteReasonLabel;
}

export const progressStatusLabels: Readonly<Record<ProgressStatus, string>> = {
  not_started: 'Não iniciado',
  started: 'Comecei',
  finished: 'Finalizado',
};

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

export const gotyEventStatusLabels: Readonly<Record<GotyEventStatus, { readonly label: string; readonly description: string }>> = {
  open: { label: 'Aberto', description: 'Aceita votos' },
  locked: { label: 'Encerrado', description: 'Bloqueia edição' },
  results_published: { label: 'Apurado', description: 'Resultados finais' },
};

export const gameDescriptionFallback = 'Sem descrição disponível.';
