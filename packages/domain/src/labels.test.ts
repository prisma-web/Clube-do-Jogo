import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appRoleLabels,
  discoverSourceLabels,
  gameDescriptionFallback,
  gotyCategorySectionLabels,
  gotyEventStatusLabels,
  libraryQuickFilterLabels,
  librarySortModeLabels,
  missingVoteReasonLabel,
  progressStatusLabels,
  ratingCriterionLabels,
  voteChoiceLabels,
  voteReasonLabel,
  voteReasonLabels,
} from './labels';
import type { VoteReason } from './types';

test('pins the visible names of domain concepts', () => {
  assert.deepEqual(voteChoiceLabels, { would_play: 'Jogaria', neutral: 'Neutro', would_not_play: 'Não' });
  assert.deepEqual(voteReasonLabels, {
    played_before: 'Já joguei e não quero de novo',
    cannot_run: 'Não consigo rodar',
    too_expensive: 'Muito caro',
    other: 'Outro',
  });
  assert.equal(missingVoteReasonLabel, 'Sem motivo informado');
  assert.deepEqual(progressStatusLabels, { not_started: 'Não iniciado', started: 'Comecei', finished: 'Finalizado' });
  assert.deepEqual(libraryQuickFilterLabels, {
    all: 'Todos',
    started: 'Comecei',
    finished: 'Finalizados',
    not_started: 'Não iniciados',
    favorites: 'Favoritos',
  });
  assert.deepEqual(librarySortModeLabels, {
    updated_desc: 'Atualizados recentemente',
    updated_asc: 'Atualizados há mais tempo',
    title_asc: 'Título: A–Z',
    title_desc: 'Título: Z–A',
    duration_asc: 'Menor duração',
    duration_desc: 'Maior duração',
    rating_desc: 'Maior nota',
    rating_asc: 'Menor nota',
  });
  assert.deepEqual(discoverSourceLabels, { popular: 'Populares', rated: 'Melhores notas', recent: 'Lançamentos', anticipated: 'Em breve' });
  assert.deepEqual(ratingCriterionLabels, { graphics: 'Gráficos', gameplay: 'Gameplay', story: 'História', music: 'Música', fun: 'Diversão' });
  assert.deepEqual(appRoleLabels, { admin: 'Admin', member: 'Usuário comum' });
  assert.deepEqual(gotyCategorySectionLabels, {
    main: 'Principais',
    craft: 'Arte & Técnica',
    genre: 'Gêneros',
    community_esports: 'Comunidade & Esports',
  });
  assert.deepEqual(gotyEventStatusLabels, {
    open: { label: 'Aberto', description: 'Aceita votos' },
    locked: { label: 'Encerrado', description: 'Bloqueia edição' },
    results_published: { label: 'Apurado', description: 'Resultados finais' },
  });
});

test('falls back when a negative vote has no known reason', () => {
  assert.equal(voteReasonLabel('cannot_run'), 'Não consigo rodar');
  assert.equal(voteReasonLabel(null), 'Sem motivo informado');
  assert.equal(voteReasonLabel(undefined), 'Sem motivo informado');
  assert.equal(voteReasonLabel('toString' as VoteReason), 'Sem motivo informado');
  assert.equal(voteReasonLabel('legacy_reason' as VoteReason), 'Sem motivo informado');
});

test('pins the text shown for a game without description', () => {
  assert.equal(gameDescriptionFallback, 'Sem descrição disponível.');
});
