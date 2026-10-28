'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Minus, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { gameCoverUrl } from '@clube-do-jogo/domain';
import type { RankingItem, VoteChoice } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { fetchRankingData } from '@/lib/data';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from './app-provider';
import { shiftMonth } from '@/lib/utils';

const CARD_LIMIT = 8;
const SWIPE_THRESHOLD = 90;

function newestUnvotedGames(items: readonly RankingItem[]) {
  return [...items]
    .filter(item => !item.votedByMe)
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
    .slice(0, CARD_LIMIT);
}

export function QuickVotingDeck() {
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, selectedMonth, isHistorical, clubRevision, runOptimistic } = useApp();
  const [closed, setClosed] = useState(false);
  const [reviewedGameIds, setReviewedGameIds] = useState<ReadonlySet<string>>(() => new Set());
  const voteMonth = shiftMonth(selectedMonth, 1);
  const rankingQuery = useStaleQuery(
    `ranking:${selectedMonth}:${isHistorical}:${user?.id}:${clubRevision}`,
    () => fetchRankingData(supabase, selectedMonth, user!.id, isDemo, isHistorical),
    Boolean(user) && !isHistorical,
  );
  const cards = useMemo(
    () => newestUnvotedGames(rankingQuery.data || []).filter(item => !reviewedGameIds.has(item.game.id)),
    [rankingQuery.data, reviewedGameIds],
  );
  const card = cards[0];

  useEffect(() => {
    const reopen = () => {
      setClosed(false);
      setReviewedGameIds(new Set());
      void rankingQuery.refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reopen();
    };
    window.addEventListener('focus', reopen);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', reopen);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [rankingQuery.refresh]);

  if (!card || closed || isHistorical) return null;

  const review = (gameId: string) => setReviewedGameIds(current => new Set([...current, gameId]));
  const restore = (gameId: string) => setReviewedGameIds(current => {
    const next = new Set(current);
    next.delete(gameId);
    return next;
  });

  async function choose(choice: VoteChoice | null) {
    const gameId = card.game.id;
    const save = () => {
      review(gameId);
      if (isDemo) return;
      void runOptimistic(
        choice ? 'Salvando escolha…' : 'Mantendo voto neutro…',
        () => undefined,
        () => restore(gameId),
        () => choice
          ? supabase.from('votes').upsert({ user_id: user!.id, game_id: gameId, vote_month: voteMonth, choice, reason: null, reason_text: null }, { onConflict: 'user_id,game_id,vote_month' })
          : supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', gameId).eq('vote_month', voteMonth),
      );
    };
    save();
  }

  const position = reviewedGameIds.size + 1;
  const total = reviewedGameIds.size + cards.length;

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="quick-voting-title">
      <section className="relative w-full max-w-sm rounded-[28px] border border-white/10 bg-zinc-950 p-5 shadow-[0_28px_90px_rgba(0,0,0,.66)] sm:p-6">
        <button type="button" onClick={() => setClosed(true)} aria-label="Fechar votação rápida" className="absolute right-3 top-3 z-20 grid size-9 place-items-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white active:scale-95">
          <X className="size-4" />
        </button>
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-300">Votação rápida</p>
        <h2 id="quick-voting-title" className="mt-1 pr-10 text-xl font-black tracking-tight text-zinc-50">Qual jogo você quer no clube?</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">Deslize para votar ou toque na capa para saber mais.</p>

        <motion.article
          key={card.game.id}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.84}
          onDragEnd={(_event, info) => {
            if (info.offset.x >= SWIPE_THRESHOLD) void choose('would_play');
            else if (info.offset.x <= -SWIPE_THRESHOLD) void choose('would_not_play');
          }}
          className="mt-5 touch-pan-y overflow-hidden rounded-2xl border border-white/10 bg-white/[.035] shadow-xl shadow-black/30"
        >
          <Link href={`/jogos/${card.game.id}`} onClick={() => setClosed(true)} className="group relative block aspect-[16/10] overflow-hidden bg-zinc-900">
            <img src={gameCoverUrl(card.game.image_url)} alt={`Capa de ${card.game.title}`} className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
            <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-extrabold text-white">Toque para saber mais</span>
          </Link>
          <div className="p-4">
            <h3 className="text-lg font-black text-zinc-100">{card.game.title}</h3>
            <p className="mt-1 text-xs font-semibold text-zinc-500">{[card.game.release_year, card.game.duration_hours ? `${card.game.duration_hours} h` : null].filter(Boolean).join(' · ')}</p>
          </div>
        </motion.article>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <VoteButton label="Não" icon={<ThumbsDown className="size-4" />} tone="text-red-300" onClick={() => void choose('would_not_play')} />
          <VoteButton label="Neutro" icon={<Minus className="size-4" />} tone="text-zinc-300" onClick={() => void choose(null)} />
          <VoteButton label="Jogaria" icon={<ThumbsUp className="size-4" />} tone="text-emerald-300" onClick={() => void choose('would_play')} />
        </div>
        <p className="mt-4 text-center text-[10px] font-black uppercase tracking-[.16em] text-zinc-600">{position} de {total}</p>
      </section>
    </div>
  );
}

function VoteButton({ label, icon, tone, onClick }: { label: string; icon: React.ReactNode; tone: string; onClick(): void }) {
  return <button type="button" onClick={onClick} className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[.035] text-[10px] font-black transition hover:bg-white/[.08] active:scale-[.97] ${tone}`}>
    {icon}<span>{label}</span>
  </button>;
}
