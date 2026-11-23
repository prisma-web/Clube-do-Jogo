'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Crown,
  Flame,
  Gamepad2,
  Heart,
  LayoutGrid,
  Music,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  ThumbsDown,
  Trash2,
  Users,
  BookOpen,
} from 'lucide-react';
import {
  computePersonalCommunityWall,
  type GotyCommunityGameSummary,
  type GotyCommunityMemberShowcase,
  type GotyFullState,
  type GotyPersonalCategory,
  type GotySearchGameResult,
} from '@clube-do-jogo/domain';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { GotyGamePickerDialog } from './goty-game-picker-dialog';
import { GotyPosterArt } from './goty-poster-art';

type PersonalSubView = 'mine' | 'wall';

function CategoryGlyph({ slug, className }: { slug: string; className?: string }) {
  switch (slug) {
    case 'meu-goty':
      return <Crown className={className} />;
    case 'melhor-narrativa':
      return <BookOpen className={className} />;
    case 'melhor-direcao-de-arte':
      return <Palette className={className} />;
    case 'melhor-trilha-sonora':
      return <Music className={className} />;
    case 'melhor-gameplay':
      return <Gamepad2 className={className} />;
    case 'maior-surpresa':
      return <Sparkles className={className} />;
    case 'melhor-multiplayer':
      return <Users className={className} />;
    case 'jogo-que-mais-marcou':
      return <Heart className={className} />;
    case 'maior-decepcao':
      return <ThumbsDown className={className} />;
    default:
      return <Flame className={className} />;
  }
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

export function GotyPersonalTab({
  state,
  userId,
  isDemo,
  onSavePick,
  onClearPick,
}: {
  state: GotyFullState;
  userId: string;
  isDemo: boolean;
  onSavePick: (categoryId: string, game: GotySearchGameResult) => Promise<void>;
  onClearPick: (categoryId: string) => Promise<void>;
}) {
  const [subView, setSubView] = useState<PersonalSubView>('mine');
  const [pickerCategory, setPickerCategory] = useState<GotyPersonalCategory | null>(null);
  const [wallCategoryFilter, setWallCategoryFilter] = useState<string>('all');
  const [selectedGameSummary, setSelectedGameSummary] = useState<GotyCommunityGameSummary | null>(null);
  const [selectedMember, setSelectedMember] = useState<GotyCommunityMemberShowcase | null>(null);

  const personalVotingOpen = state.event.personal_voting_open;

  const myPicks = useMemo(
    () => state.personalPicks.filter(pick => pick.user_id === userId),
    [state.personalPicks, userId],
  );
  const myPickByCategory = useMemo(
    () => new Map(myPicks.map(pick => [pick.category_id, pick])),
    [myPicks],
  );
  const myGameTitlesSet = useMemo(
    () => new Set(myPicks.map(pick => pick.game_title.trim().toLocaleLowerCase('pt-BR'))),
    [myPicks],
  );

  const filteredWallPicks = useMemo(
    () =>
      wallCategoryFilter === 'all'
        ? state.personalPicks
        : state.personalPicks.filter(pick => pick.category_id === wallCategoryFilter),
    [state.personalPicks, wallCategoryFilter],
  );

  const wall = useMemo(
    () => computePersonalCommunityWall(filteredWallPicks, state.personalCategories, state.profiles),
    [filteredWallPicks, state.personalCategories, state.profiles],
  );

  const fullWall = useMemo(
    () => computePersonalCommunityWall(state.personalPicks, state.personalCategories, state.profiles),
    [state.personalPicks, state.personalCategories, state.profiles],
  );

  const mainCategory = state.personalCategories[0] ?? null;
  const secondaryCategories = state.personalCategories.slice(1);
  const mainPick = mainCategory ? myPickByCategory.get(mainCategory.id) ?? null : null;

  return (
    <div className="space-y-6">
      {/* Switcher Minhas Escolhas / Mural do Clube */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-[#dfc06c]/20 bg-[#100f15] p-1">
          <button
            type="button"
            onClick={() => setSubView('mine')}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold transition',
              subView === 'mine'
                ? 'bg-gradient-to-r from-[#d4ab48] to-[#f0d586] text-[#140f05] shadow-md'
                : 'text-[#b7ab8f] hover:text-[#f6ecd0]',
            )}
          >
            <Heart className="size-3.5" />
            Minhas escolhas
            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
              {myPicks.length}/{state.personalCategories.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('wall')}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold transition',
              subView === 'wall'
                ? 'bg-gradient-to-r from-[#d4ab48] to-[#f0d586] text-[#140f05] shadow-md'
                : 'text-[#b7ab8f] hover:text-[#f6ecd0]',
            )}
          >
            <LayoutGrid className="size-3.5" />
            Os GOTYs do clube
            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
              {fullWall.totalParticipants}
            </span>
          </button>
        </div>

        <p className="text-[11px] font-semibold text-[#a79c82]">
          Votação afetiva e independente do Bolão · Priorizando lançamentos comerciais de 2026
        </p>
      </div>

      {/* Sub-aba 1: Minhas Escolhas (Seu GOTY) */}
      {subView === 'mine' && (
        <div className="space-y-5">
          {/* Destaque principal: Meu GOTY */}
          {mainCategory && (
            <section className="goty-surface relative overflow-hidden rounded-[28px] border border-[#e8c66d]/45 bg-gradient-to-br from-[#1f180b] via-[#111017] to-[#0a0a0f] p-5 shadow-[0_24px_65px_rgba(0,0,0,0.65)] sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {mainPick ? (
                  <GotyPosterArt
                    title={mainPick.game_title}
                    imageUrl={mainPick.game_image_url}
                    className="mx-auto aspect-[3/4] w-36 shrink-0 rounded-2xl border border-[#f0cf72]/40 shadow-[0_18px_40px_rgba(0,0,0,0.75)] sm:mx-0 sm:w-40"
                  />
                ) : (
                  <button
                    type="button"
                    disabled={!personalVotingOpen}
                    onClick={() => setPickerCategory(mainCategory)}
                    className="group mx-auto flex aspect-[3/4] w-36 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#dfc06c]/35 bg-[#15131c]/70 p-4 text-center transition hover:border-[#f0cf72]/70 hover:bg-[#1c1812] disabled:opacity-50 sm:mx-0 sm:w-40"
                  >
                    <span className="grid size-11 place-items-center rounded-full border border-[#dfc06c]/35 bg-[#dfc06c]/15 text-[#f3da91] transition group-hover:scale-110">
                      <Plus className="size-5" />
                    </span>
                    <span className="text-[11px] font-extrabold text-[#f2dfb0]">Escolher Meu GOTY</span>
                  </button>
                )}

                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#d4aa47] to-[#f4df9b] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#171105]">
                    <Crown className="size-3" />
                    {mainCategory.name} · 2026
                  </span>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-[#fff9e8] sm:text-3xl">
                    {mainPick ? mainPick.game_title : 'Qual foi o seu jogo do ano?'}
                  </h2>
                  <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-[#b7aa8c]">
                    {mainPick
                      ? [
                          mainPick.game_release_year ? `Lançamento ${mainPick.game_release_year}` : null,
                          ...(mainPick.game_genres || []).slice(0, 2),
                          ...(mainPick.game_platforms || []).slice(0, 3),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : mainCategory.description}
                  </p>

                  {personalVotingOpen && (
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      <button
                        type="button"
                        onClick={() => setPickerCategory(mainCategory)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#c79933] via-[#e6c263] to-[#f4df9a] px-4 text-xs font-black text-[#171105] shadow-[0_8px_24px_rgba(218,176,72,0.28)] transition hover:brightness-105"
                      >
                        {mainPick ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                        {mainPick ? 'Trocar jogo' : 'Escolher jogo de 2026'}
                      </button>
                      {mainPick && (
                        <button
                          type="button"
                          onClick={() => void onClearPick(mainCategory.id)}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-bold text-[#c7b999] transition hover:border-red-400/35 hover:text-red-200"
                        >
                          <Trash2 className="size-3.5" />
                          Remover
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSubView('wall')}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#dfc06c]/25 bg-[#dfc06c]/10 px-3.5 text-xs font-bold text-[#f2da92] transition hover:bg-[#dfc06c]/18"
                      >
                        <LayoutGrid className="size-3.5" />
                        Ver mural do clube
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Demais 8 categorias afetivas */}
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {secondaryCategories.map(category => {
              const pick = myPickByCategory.get(category.id) ?? null;
              return (
                <article
                  key={category.id}
                  className={cn(
                    'goty-surface flex flex-col justify-between gap-4 rounded-3xl border p-4 transition',
                    pick
                      ? 'border-[#dfc06c]/30 bg-[#111017]'
                      : 'border-white/[0.08] bg-[#0d0c12] hover:border-[#dfc06c]/25',
                  )}
                >
                  <div className="flex items-start gap-3.5">
                    {pick ? (
                      <GotyPosterArt
                        title={pick.game_title}
                        imageUrl={pick.game_image_url}
                        compact
                        className="h-24 w-[68px] shrink-0 rounded-xl border border-[#dfc06c]/30"
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={!personalVotingOpen}
                        onClick={() => setPickerCategory(category)}
                        aria-label={`Escolher jogo para ${category.name}`}
                        className="grid h-24 w-[68px] shrink-0 place-items-center rounded-xl border border-dashed border-[#dfc06c]/30 bg-[#15141c] text-[#d9b65b] transition hover:border-[#f0cf72]/65 hover:bg-[#1c1812] disabled:opacity-50"
                      >
                        <Plus className="size-5" />
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#e3c168]">
                        <CategoryGlyph slug={category.slug} className="size-3" />
                        {category.name}
                      </span>
                      {pick ? (
                        <>
                          <h3 className="mt-1 line-clamp-2 text-sm font-black text-[#fff9e8]">
                            {pick.game_title}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-[11px] text-[#9f937a]">
                            {[
                              pick.game_release_year ? `${pick.game_release_year}` : null,
                              ...(pick.game_genres || []).slice(0, 2),
                              ...(pick.game_platforms || []).slice(0, 2),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="mt-1 text-sm font-bold text-[#c7bca1]">Ainda sem escolha</h3>
                          <p className="mt-1 text-[11px] leading-relaxed text-[#8f846d]">
                            {category.description}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {personalVotingOpen && (
                    <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
                      {pick && (
                        <button
                          type="button"
                          onClick={() => void onClearPick(category.id)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-[#9c9077] transition hover:bg-red-500/10 hover:text-red-200"
                        >
                          <Trash2 className="size-3" /> Remover
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPickerCategory(category)}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-extrabold transition',
                          pick
                            ? 'border border-[#dfc06c]/25 bg-[#dfc06c]/10 text-[#f3da91] hover:bg-[#dfc06c]/20'
                            : 'bg-[#dfc06c] text-[#171105] hover:brightness-105',
                        )}
                      >
                        {pick ? <Pencil className="size-3" /> : <Plus className="size-3" />}
                        {pick ? 'Trocar' : 'Escolher jogo'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-aba 2: Mural Comunitário — Os GOTYs do Clube */}
      {subView === 'wall' && (
        <div className="space-y-8">
          {/* Estatísticas do mural */}
          <section className="goty-surface relative overflow-hidden rounded-3xl border border-[#dfc06c]/30 bg-gradient-to-br from-[#1a150c] via-[#100f15] to-[#0a0a0e] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#e5c369]">
                  <Sparkles className="size-3.5" />
                  Retrospectiva Coletiva 2026
                </span>
                <h2 className="mt-1 text-xl font-black tracking-tight text-[#fff9e8] sm:text-2xl">
                  Os GOTYs do Clube
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[#b3a689]">
                  Mosaico vivo com os jogos mais escolhidos pela comunidade. Clique em qualquer capa ou membro para descobrir afinidades e opiniões.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:w-72">
                <div className="rounded-2xl border border-[#dfc06c]/20 bg-black/35 p-3 text-center">
                  <span className="block text-[9px] font-black uppercase tracking-wider text-[#a99b7c]">Membros</span>
                  <strong className="mt-1 block text-lg font-black text-[#f7de93]">{fullWall.totalParticipants}</strong>
                </div>
                <div className="rounded-2xl border border-[#dfc06c]/20 bg-black/35 p-3 text-center">
                  <span className="block text-[9px] font-black uppercase tracking-wider text-[#a99b7c]">Escolhas</span>
                  <strong className="mt-1 block text-lg font-black text-[#fff9e8]">{fullWall.totalPicks}</strong>
                </div>
                <div className="rounded-2xl border border-[#dfc06c]/20 bg-black/35 p-3 text-center">
                  <span className="block text-[9px] font-black uppercase tracking-wider text-[#a99b7c]">Jogos</span>
                  <strong className="mt-1 block text-lg font-black text-[#d6cab0]">{fullWall.topGames.length}</strong>
                </div>
              </div>
            </div>

            {/* Filtro por categoria no mural */}
            <div className="-mx-5 mt-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setWallCategoryFilter('all')}
                  className={cn(
                    'h-8 rounded-full border px-3 text-[11px] font-bold transition',
                    wallCategoryFilter === 'all'
                      ? 'border-[#e8c66d]/65 bg-[#dfc06c]/20 text-[#fff5d6]'
                      : 'border-white/10 bg-black/30 text-[#a79c82] hover:border-[#dfc06c]/35',
                  )}
                >
                  Todas as categorias
                </button>
                {state.personalCategories.map(category => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setWallCategoryFilter(category.id)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition',
                      wallCategoryFilter === category.id
                        ? 'border-[#e8c66d]/65 bg-[#dfc06c]/20 text-[#fff5d6]'
                        : 'border-white/10 bg-black/30 text-[#a79c82] hover:border-[#dfc06c]/35',
                    )}
                  >
                    <CategoryGlyph slug={category.slug} className="size-3" />
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Mosaico Visual de Capas — Jogos Mais Escolhidos */}
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-black tracking-tight text-[#fff9e8] sm:text-lg">
                  Mosaico dos Jogos Mais Escolhidos
                </h3>
                <p className="text-xs text-[#9e9278]">
                  Toque em uma capa para ver quem escolheu e em quais prêmios o jogo apareceu.
                </p>
              </div>
            </div>

            {wall.topGames.length === 0 ? (
              <div className="grid min-h-48 place-items-center rounded-3xl border border-dashed border-[#dfc06c]/20 bg-[#0f0e14] p-8 text-center">
                <div>
                  <Sparkles className="mx-auto size-7 text-[#c9a854]" />
                  <p className="mt-2 text-sm font-bold text-[#f7efd7]">
                    Nenhuma escolha registrada nesta categoria ainda
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubView('mine')}
                    className="mt-3 rounded-xl bg-[#dfc06c] px-4 py-2 text-xs font-black text-[#171105]"
                  >
                    Fazer minhas escolhas
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {wall.topGames.map((summary, index) => {
                  const isSpotlight = index === 0 && wall.topGames.length >= 3;
                  const sharedWithMe = myGameTitlesSet.has(summary.title.trim().toLocaleLowerCase('pt-BR'));
                  return (
                    <button
                      key={summary.key}
                      type="button"
                      onClick={() => setSelectedGameSummary(summary)}
                      className={cn(
                        'goty-surface group relative flex flex-col overflow-hidden rounded-[24px] border text-left transition duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1d37e]',
                        isSpotlight
                          ? 'col-span-2 sm:col-span-2 border-[#e8c66d]/55 bg-gradient-to-br from-[#20190c] to-[#0e0d13] shadow-[0_18px_50px_rgba(218,176,72,0.16)]'
                          : 'border-[#dfc06c]/20 bg-[#111017] hover:border-[#e8c66d]/50',
                      )}
                    >
                      <div className={cn('relative w-full overflow-hidden', isSpotlight ? 'aspect-[16/10]' : 'aspect-[3/4]')}>
                        <GotyPosterArt
                          title={summary.title}
                          subtitle={summary.genres.slice(0, 2).join(' · ')}
                          imageUrl={summary.image_url}
                          className="size-full"
                        />

                        {/* Badge contagem */}
                        <div className="absolute left-2.5 top-2.5 z-20 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#d4aa47] to-[#f4df9b] px-2.5 py-1 text-[10px] font-black text-[#171105] shadow-lg">
                            {index === 0 && <Crown className="size-3" />}
                            {summary.uniqueMembersCount} {summary.uniqueMembersCount === 1 ? 'membro' : 'membros'}
                          </span>
                          {sharedWithMe && (
                            <span className="rounded-full border border-emerald-400/40 bg-emerald-950/85 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-200 backdrop-blur-sm">
                              Você também
                            </span>
                          )}
                        </div>

                        {/* Pilha de avatares no rodapé da capa */}
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 flex items-end justify-between gap-2">
                          <div className="flex -space-x-2">
                            {summary.members.slice(0, 4).map(member => (
                              <Avatar
                                key={member.id}
                                src={member.avatar_url}
                                crop={member.avatar_crop}
                                name={member.name}
                                className="size-7 border-2 border-[#0c0b10]"
                              />
                            ))}
                            {summary.members.length > 4 && (
                              <span className="grid size-7 place-items-center rounded-full border-2 border-[#0c0b10] bg-[#1e1a12] text-[9px] font-black text-[#f4df9b]">
                                +{summary.members.length - 4}
                              </span>
                            )}
                          </div>
                          {summary.totalPicks > summary.uniqueMembersCount && (
                            <span className="rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-bold text-[#e5d2a0] backdrop-blur-sm">
                              {summary.totalPicks} citações
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col justify-between p-3">
                        <strong className={cn('line-clamp-2 font-black tracking-tight text-[#fff9e8]', isSpotlight ? 'text-base sm:text-lg' : 'text-xs sm:text-sm')}>
                          {summary.title}
                        </strong>
                        <p className="mt-1.5 line-clamp-1 text-[10px] font-semibold text-[#b8aa8c]">
                          {summary.categoryNames.slice(0, 3).join(' · ')}
                          {summary.categoryNames.length > 3 ? ` +${summary.categoryNames.length - 3}` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Escolhas Individuais por Membro */}
          <section className="space-y-4">
            <div>
              <h3 className="text-base font-black tracking-tight text-[#fff9e8] sm:text-lg">
                GOTYs Pessoais de Cada Membro
              </h3>
              <p className="text-xs text-[#9e9278]">
                Explore a seleção completa de cada pessoa do clube e descubra jogos em comum.
              </p>
            </div>

            {fullWall.memberShowcases.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-[#0f0e14] p-6 text-center text-xs text-[#9e9278]">
                Ainda ninguém preencheu o Seu GOTY 2026. Seja o primeiro!
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {fullWall.memberShowcases.map(member => {
                  const isMe = member.user_id === userId;
                  const sharedCount = isMe
                    ? 0
                    : new Set(
                        member.picks
                          .map(item => item.pick.game_title.trim().toLocaleLowerCase('pt-BR'))
                          .filter(title => myGameTitlesSet.has(title)),
                      ).size;

                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      onClick={() => setSelectedMember(member)}
                      className="goty-surface group flex items-center gap-3.5 rounded-3xl border border-[#dfc06c]/20 bg-[#100f16] p-4 text-left transition hover:border-[#e8c66d]/55 hover:bg-[#15141d]"
                    >
                      <GotyPosterArt
                        title={member.mainGotyPick?.game_title || member.picks[0]?.pick.game_title || 'GOTY 2026'}
                        imageUrl={member.mainGotyPick?.game_image_url || member.picks[0]?.pick.game_image_url}
                        compact
                        className="h-24 w-[68px] shrink-0 rounded-xl border border-[#dfc06c]/30"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Avatar
                            src={member.profile.avatar_url}
                            crop={member.profile.avatar_crop}
                            name={member.profile.name}
                            className="size-7 border-[#dfc06c]/30"
                          />
                          <strong className="truncate text-sm font-black text-[#fff9e8]">
                            {member.profile.name || 'Membro'}
                          </strong>
                          {isMe && (
                            <span className="rounded-full bg-[#dfc06c]/20 px-2 py-0.5 text-[9px] font-black uppercase text-[#f4df9b]">
                              Você
                            </span>
                          )}
                        </div>

                        {member.mainGotyPick ? (
                          <p className="mt-2 truncate text-xs font-bold text-[#efd68e]">
                            <Crown className="mr-1 inline size-3" />
                            Meu GOTY: <span className="text-[#fff9e8]">{member.mainGotyPick.game_title}</span>
                          </p>
                        ) : (
                          <p className="mt-2 text-xs font-semibold text-[#9d9177]">
                            {member.picksCount} {member.picksCount === 1 ? 'categoria preenchida' : 'categorias preenchidas'}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[#bfb396]">
                            {member.picksCount}/{state.personalCategories.length} escolhas
                          </span>
                          {sharedCount > 0 && (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/12 px-2 py-0.5 text-emerald-200">
                              {sharedCount} {sharedCount === 1 ? 'jogo em comum' : 'jogos em comum'}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal: Seletor de Jogos 2026 */}
      <GotyGamePickerDialog
        open={Boolean(pickerCategory)}
        onOpenChange={open => { if (!open) setPickerCategory(null); }}
        category={pickerCategory}
        selectedTitle={pickerCategory ? myPickByCategory.get(pickerCategory.id)?.game_title : null}
        isDemo={isDemo}
        onSelect={async game => {
          if (!pickerCategory) return;
          await onSavePick(pickerCategory.id, game);
        }}
      />

      {/* Modal: Quem escolheu este jogo */}
      <Dialog open={Boolean(selectedGameSummary)} onOpenChange={open => { if (!open) setSelectedGameSummary(null); }}>
        <DialogContent
          title={selectedGameSummary?.title || 'Jogo no Mural'}
          description={
            selectedGameSummary
              ? `Escolhido por ${selectedGameSummary.uniqueMembersCount} ${selectedGameSummary.uniqueMembersCount === 1 ? 'membro' : 'membros'} em ${selectedGameSummary.totalPicks} ${selectedGameSummary.totalPicks === 1 ? 'categoria' : 'categorias'}`
              : undefined
          }
          className="goty-dialog max-w-xl border-[#dfc06c]/30 bg-[#0b0a0f] text-[#faf4e4]"
        >
          {selectedGameSummary && (
            <div className="max-h-[calc(min(88dvh,760px)-88px)] space-y-4 overflow-y-auto p-5">
              <div className="flex items-center gap-4 rounded-2xl border border-[#dfc06c]/20 bg-[#14131b] p-3.5">
                <GotyPosterArt
                  title={selectedGameSummary.title}
                  imageUrl={selectedGameSummary.image_url}
                  compact
                  className="h-24 w-[68px] shrink-0 rounded-xl border border-[#dfc06c]/30"
                />
                <div className="min-w-0 flex-1">
                  <strong className="block text-base font-black text-[#fff9e8]">{selectedGameSummary.title}</strong>
                  <p className="mt-1 text-xs text-[#a89c7f]">
                    {[
                      selectedGameSummary.release_year ? `Lançamento ${selectedGameSummary.release_year}` : null,
                      ...selectedGameSummary.genres.slice(0, 2),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {isUuid(selectedGameSummary.game_id) && (
                    <Link
                      href={`/jogos/${selectedGameSummary.game_id}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold text-[#f2d687] hover:underline"
                    >
                      Ver página do jogo no clube <ArrowUpRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {selectedGameSummary.picks.map((detail, idx) => (
                  <div
                    key={`${detail.user_id}:${detail.category_id}:${idx}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#13121a] px-3.5 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar
                        src={detail.profile.avatar_url}
                        crop={detail.profile.avatar_crop}
                        name={detail.profile.name}
                        className="size-9 border-[#dfc06c]/25"
                      />
                      <div className="min-w-0">
                        <strong className="block truncate text-xs font-extrabold text-[#faf4e4]">
                          {detail.profile.name || 'Membro'}
                        </strong>
                        <span className="block text-[11px] font-semibold text-[#e3c168]">
                          {detail.category_name}
                        </span>
                      </div>
                    </div>
                    <CategoryGlyph slug={detail.category_slug} className="size-4 shrink-0 text-[#c7b483]" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Vitrine completa dos GOTYs de um membro */}
      <Dialog open={Boolean(selectedMember)} onOpenChange={open => { if (!open) setSelectedMember(null); }}>
        <DialogContent
          title={selectedMember ? `GOTYs 2026 de ${selectedMember.profile.name || 'Membro'}` : 'GOTYs do Membro'}
          description={selectedMember ? `${selectedMember.picksCount} categorias preenchidas no Seu GOTY` : undefined}
          className="goty-dialog max-w-2xl border-[#dfc06c]/30 bg-[#0b0a0f] text-[#faf4e4]"
        >
          {selectedMember && (
            <div className="max-h-[calc(min(88dvh,760px)-88px)] space-y-2.5 overflow-y-auto p-4 sm:p-5">
              {selectedMember.picks.map(({ category, pick }) => {
                const isShared =
                  selectedMember.user_id !== userId
                  && myGameTitlesSet.has(pick.game_title.trim().toLocaleLowerCase('pt-BR'));
                return (
                  <div
                    key={category.id}
                    className="flex items-center gap-3 rounded-2xl border border-[#dfc06c]/18 bg-[#14131b] p-3"
                  >
                    <GotyPosterArt
                      title={pick.game_title}
                      imageUrl={pick.game_image_url}
                      compact
                      className="h-16 w-12 shrink-0 rounded-lg border border-white/10"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#e3c168]">
                        <CategoryGlyph slug={category.slug} className="size-3" />
                        {category.name}
                      </span>
                      <strong className="mt-0.5 block truncate text-sm font-black text-[#fff9e8]">
                        {pick.game_title}
                      </strong>
                    </div>
                    {isShared && (
                      <span className="shrink-0 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black text-emerald-200">
                        Em comum
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
