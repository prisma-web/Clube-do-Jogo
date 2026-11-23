'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { CalendarDays, ExternalLink, Heart, Trophy } from 'lucide-react';
import { GotyDataClient } from '@clube-do-jogo/data';
import {
  GOTY_2026_EDITION_YEAR,
  type GotyEventStatus,
  type GotyFullState,
  type GotySearchGameResult,
} from '@clube-do-jogo/domain';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/app-provider';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { ListSkeleton } from '@/components/ui/skeleton';
import { GotyBolaoTab } from './goty-bolao-tab';
import { GotyPersonalTab } from './goty-personal-tab';
import { TgaEmblem } from './tga-emblem';

type GotyTab = 'bolao' | 'seu-goty';

function formatCeremonyDate(value?: string | null): string {
  if (!value) return '10 dez 2026';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '10 dez 2026';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function GotyExperience() {
  const supabase = useMemo(() => createClient(), []);
  const gotyClient = useMemo(() => new GotyDataClient(supabase), [supabase]);
  const { user, isDemo, isAdmin, runOptimistic, runOperation, notify } = useApp();
  const [activeTab, setActiveTab] = useState<GotyTab>('bolao');
  const autoCoverTriggered = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const param = new URLSearchParams(window.location.search).get('tab');
    if (param === 'seu-goty' || param === 'bolao') {
      queueMicrotask(() => setActiveTab(param));
    }
  }, []);

  const handleTabChange = useCallback((value: string) => {
    const next: GotyTab = value === 'seu-goty' ? 'seu-goty' : 'bolao';
    setActiveTab(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, []);

  const query = useStaleQuery<GotyFullState>(
    `goty-2026:${user?.id}:${isDemo}`,
    () => gotyClient.readFullState({ userId: user!.id, isDemo, editionYear: GOTY_2026_EDITION_YEAR }),
    Boolean(user),
    { staleTime: 20_000 },
  );

  // Em produção com Supabase + IGDB, tenta preencher capas ausentes em segundo plano uma vez por sessão
  useEffect(() => {
    if (isDemo || !query.data || autoCoverTriggered.current) return;
    const hasUnresolvedGameCovers = query.data.categories.some(category =>
      category.nominees.some(nominee => nominee.game_query && !nominee.image_url),
    );
    if (!hasUnresolvedGameCovers) return;
    autoCoverTriggered.current = true;
    void apiFetch('/api/goty/resolve-covers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 15 }),
    })
      .then(res => (res.ok ? res.json() : null))
      .then(payload => {
        if (payload && typeof payload.updated === 'number' && payload.updated > 0) {
          void query.refresh();
        }
      })
      .catch(() => undefined);
  }, [isDemo, query]);

  const state = query.data;

  const handleSelectBolaoVote = useCallback(
    async (categoryId: string, nomineeId: string) => {
      if (!user || !state) return;
      const previous = state;
      const now = new Date().toISOString();
      const nextVotes = [
        ...state.bolaoVotes.filter(vote => !(vote.user_id === user.id && vote.category_id === categoryId)),
        {
          edition_year: GOTY_2026_EDITION_YEAR,
          user_id: user.id,
          category_id: categoryId,
          nominee_id: nomineeId,
          updated_at: now,
        },
      ];
      const nextState: GotyFullState = { ...state, bolaoVotes: nextVotes };

      if (isDemo) {
        query.setData(nextState);
        await gotyClient.saveBolaoVote({ userId: user.id, isDemo: true, categoryId, nomineeId });
        return;
      }

      await runOptimistic(
        'Salvando palpite do Bolão…',
        () => query.setData(nextState),
        () => query.setData(previous),
        () => gotyClient.saveBolaoVote({ userId: user.id, isDemo: false, categoryId, nomineeId }),
      );
    },
    [gotyClient, isDemo, query, runOptimistic, state, user],
  );

  const handleSetBolaoConfirmation = useCallback(
    async (confirm: boolean) => {
      if (!user || !state) return;
      const previous = state;
      const now = new Date().toISOString();
      const nextSub = {
        edition_year: GOTY_2026_EDITION_YEAR,
        user_id: user.id,
        confirmed_at: confirm ? now : null,
        updated_at: now,
      };
      const nextSubmissions = [
        ...state.bolaoSubmissions.filter(item => item.user_id !== user.id),
        nextSub,
      ];
      const nextState: GotyFullState = { ...state, bolaoSubmissions: nextSubmissions };

      if (isDemo) {
        query.setData(nextState);
        await gotyClient.setBolaoConfirmation({ userId: user.id, isDemo: true, confirm });
        notify(confirm ? 'Bolão GOTY 2026 confirmado!' : 'Bolão reaberto para ajustes');
        return;
      }

      const ok = await runOptimistic(
        confirm ? 'Confirmando Bolão GOTY 2026…' : 'Reabrindo rascunho…',
        () => query.setData(nextState),
        () => query.setData(previous),
        () => gotyClient.setBolaoConfirmation({ userId: user.id, isDemo: false, confirm }),
      );
      if (ok) notify(confirm ? 'Bolão GOTY 2026 confirmado!' : 'Bolão reaberto para ajustes');
    },
    [gotyClient, isDemo, notify, query, runOptimistic, state, user],
  );

  const handleSavePersonalPick = useCallback(
    async (categoryId: string, game: GotySearchGameResult) => {
      if (!user || !state) return;
      const previous = state;
      const now = new Date().toISOString();
      const nextPick = {
        edition_year: GOTY_2026_EDITION_YEAR,
        user_id: user.id,
        category_id: categoryId,
        game_id: game.id,
        igdb_id: game.igdb_id ?? null,
        game_title: game.title,
        game_image_url: game.image_url,
        game_release_year: game.effective_release_year ?? game.release_year ?? 2026,
        game_platforms: game.platforms || [],
        game_genres: game.genres || [],
        release_eligibility: game.release_eligibility,
        updated_at: now,
      };
      const nextPicks = [
        ...state.personalPicks.filter(pick => !(pick.user_id === user.id && pick.category_id === categoryId)),
        nextPick,
      ];
      const nextState: GotyFullState = { ...state, personalPicks: nextPicks };

      if (isDemo) {
        query.setData(nextState);
        await gotyClient.savePersonalPick({ userId: user.id, isDemo: true, categoryId, game });
        notify('Escolha salva no Seu GOTY');
        return;
      }

      const ok = await runOptimistic(
        'Salvando escolha no Seu GOTY…',
        () => query.setData(nextState),
        () => query.setData(previous),
        () => gotyClient.savePersonalPick({ userId: user.id, isDemo: false, categoryId, game }),
      );
      if (ok) notify('Escolha salva no Seu GOTY');
    },
    [gotyClient, isDemo, notify, query, runOptimistic, state, user],
  );

  const handleClearPersonalPick = useCallback(
    async (categoryId: string) => {
      if (!user || !state) return;
      const previous = state;
      const nextPicks = state.personalPicks.filter(
        pick => !(pick.user_id === user.id && pick.category_id === categoryId),
      );
      const nextState: GotyFullState = { ...state, personalPicks: nextPicks };

      if (isDemo) {
        query.setData(nextState);
        await gotyClient.clearPersonalPick({ userId: user.id, isDemo: true, categoryId });
        notify('Escolha removida');
        return;
      }

      const ok = await runOptimistic(
        'Removendo escolha…',
        () => query.setData(nextState),
        () => query.setData(previous),
        () => gotyClient.clearPersonalPick({ userId: user.id, isDemo: false, categoryId }),
      );
      if (ok) notify('Escolha removida');
    },
    [gotyClient, isDemo, notify, query, runOptimistic, state, user],
  );

  const handleAdminUpdateEvent = useCallback(
    async (patch: { status?: GotyEventStatus; votingClosesAt?: string | null; personalVotingOpen?: boolean }) => {
      if (!user || !state || !isAdmin) return;
      const previous = state;
      const nextState: GotyFullState = {
        ...state,
        event: {
          ...state.event,
          status: patch.status ?? state.event.status,
          voting_closes_at: patch.votingClosesAt !== undefined ? patch.votingClosesAt : state.event.voting_closes_at,
          personal_voting_open: patch.personalVotingOpen ?? state.event.personal_voting_open,
        },
      };

      if (isDemo) {
        query.setData(nextState);
        await gotyClient.updateEventSettings({ userId: user.id, isDemo: true, ...patch });
        notify('Configuração do evento atualizada');
        return;
      }

      const ok = await runOptimistic(
        'Atualizando configurações do GOTY…',
        () => query.setData(nextState),
        () => query.setData(previous),
        () => gotyClient.updateEventSettings({ userId: user.id, isDemo: false, ...patch }),
      );
      if (ok) notify('Configuração do evento atualizada');
    },
    [gotyClient, isAdmin, isDemo, notify, query, runOptimistic, state, user],
  );

  const handleAdminSetWinner = useCallback(
    async (categoryId: string, winnerNomineeId: string | null) => {
      if (!user || !state || !isAdmin) return;
      const previous = state;
      const now = new Date().toISOString();
      const nextCategories = state.categories.map(category =>
        category.id === categoryId
          ? {
              ...category,
              winner_nominee_id: winnerNomineeId,
              winner_set_at: winnerNomineeId ? now : null,
              winner_set_by: winnerNomineeId ? user.id : null,
            }
          : category,
      );
      const nextState: GotyFullState = { ...state, categories: nextCategories };

      if (isDemo) {
        query.setData(nextState);
        await gotyClient.setCategoryWinner({ userId: user.id, isDemo: true, categoryId, winnerNomineeId });
        notify(winnerNomineeId ? 'Vencedor oficial registrado!' : 'Vencedor removido');
        return;
      }

      const ok = await runOptimistic(
        'Registrando vencedor oficial…',
        () => query.setData(nextState),
        () => query.setData(previous),
        () => gotyClient.setCategoryWinner({ userId: user.id, isDemo: false, categoryId, winnerNomineeId }),
      );
      if (ok) notify(winnerNomineeId ? 'Vencedor oficial registrado!' : 'Vencedor removido');
    },
    [gotyClient, isAdmin, isDemo, notify, query, runOptimistic, state, user],
  );

  const handleAdminSyncCovers = useCallback(async () => {
    if (isDemo) {
      notify('No modo demo os cartazes editoriais dourados estão ativos');
      return;
    }
    await runOperation('Atualizando capas dos indicados via IGDB…', async () => {
      const response = await apiFetch('/api/goty/resolve-covers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 30 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar as capas.');
      await query.refresh();
      notify(
        payload.updated > 0
          ? `${payload.updated} capas atualizadas com sucesso`
          : 'Todas as capas disponíveis já estão sincronizadas',
      );
    });
  }, [isDemo, notify, query, runOperation]);

  return (
    <div className="goty-stage relative mx-auto max-w-6xl animate-fade-in rounded-[32px] border border-[#dfc06c]/25 bg-[#07070b] p-4 text-[#fbf5e3] shadow-[0_28px_90px_rgba(0,0,0,0.72)] sm:p-6 lg:p-8">
      {/* Iluminação de palco de premiação */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 rounded-t-[32px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(223,180,81,0.22),rgba(223,180,81,0.04)_48%,transparent_75%)]"
      />

      {/* Cabeçalho de gala GOTY 2026 */}
      <header className="relative flex flex-col gap-5 border-b border-[#dfc06c]/18 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-[#f0cf72]/45 bg-gradient-to-br from-[#2d2210] via-[#13100b] to-[#08080b] shadow-[0_12px_32px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,244,200,0.35)] sm:size-16">
            <TgaEmblem className="size-9 sm:size-10" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-[#e5c369]/40 bg-[#dfc06c]/14 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#f5de96]">
                Evento Especial do Clube
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#a99c7f]">
                <CalendarDays className="size-3.5 text-[#d7b458]" />
                Cerimônia em {formatCeremonyDate(state?.event.ceremony_at)}
              </span>
            </div>
            <h1 className="mt-2 bg-gradient-to-r from-[#fff8e0] via-[#f1d483] to-[#c79935] bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
              GOTY 2026
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#b9ae92] sm:text-sm">
              Participe do Bolão oficial com as 30 categorias do The Game Awards 2026 e celebre os jogos que marcaram o seu ano no mural coletivo do clube.
            </p>
          </div>
        </div>

        <a
          href={state?.event.source_url || 'https://thegameawards.com/nominees'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-[#dfc06c]/25 bg-black/40 px-3 py-1.5 text-[11px] font-bold text-[#dcc790] transition hover:border-[#e8c66d]/55 hover:text-[#fff5d6] sm:self-end"
        >
          Fonte oficial TGA 2026
          <ExternalLink className="size-3" />
        </a>
      </header>

      {/* Conteúdo principal com as duas abas */}
      <div className="relative mt-6">
        {query.isInitialLoading || !state ? (
          <ListSkeleton count={5} />
        ) : query.error ? (
          <div className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-red-400/25 bg-red-950/20 p-8 text-center text-sm text-red-200">
            <div>
              <p className="font-bold">{query.error.message}</p>
              <button
                type="button"
                onClick={() => void query.refresh()}
                className="mt-4 rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-2 text-xs font-extrabold text-red-100"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : (
          <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
            <Tabs.List
              aria-label="Seções do GOTY 2026"
              className="goty-tabs mb-6 grid w-full grid-cols-2 gap-2 rounded-2xl border border-[#dfc06c]/25 bg-[#100f16] p-1.5 sm:max-w-md"
            >
              <Tabs.Trigger
                value="bolao"
                className="flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black tracking-tight text-[#b7aa8c] transition hover:text-[#fff8e4] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#c89a34] data-[state=active]:via-[#e5c160] data-[state=active]:to-[#f4df9a] data-[state=active]:text-[#171105] data-[state=active]:shadow-[0_8px_24px_rgba(220,178,74,0.28)]"
              >
                <Trophy className="size-4" />
                Bolão GOTY
              </Tabs.Trigger>
              <Tabs.Trigger
                value="seu-goty"
                className="flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black tracking-tight text-[#b7aa8c] transition hover:text-[#fff8e4] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#c89a34] data-[state=active]:via-[#e5c160] data-[state=active]:to-[#f4df9a] data-[state=active]:text-[#171105] data-[state=active]:shadow-[0_8px_24px_rgba(220,178,74,0.28)]"
              >
                <Heart className="size-4" />
                Seu GOTY
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="bolao" className="outline-none">
              <GotyBolaoTab
                state={state}
                userId={user!.id}
                isAdmin={isAdmin}
                onSelectVote={handleSelectBolaoVote}
                onSetConfirmation={handleSetBolaoConfirmation}
                onAdminUpdateEvent={handleAdminUpdateEvent}
                onAdminSetWinner={handleAdminSetWinner}
                onAdminSyncCovers={handleAdminSyncCovers}
              />
            </Tabs.Content>

            <Tabs.Content value="seu-goty" className="outline-none">
              <GotyPersonalTab
                state={state}
                userId={user!.id}
                isDemo={isDemo}
                onSavePick={handleSavePersonalPick}
                onClearPick={handleClearPersonalPick}
              />
            </Tabs.Content>
          </Tabs.Root>
        )}
      </div>
    </div>
  );
}
