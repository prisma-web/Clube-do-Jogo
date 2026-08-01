'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Clock3, Library, MoreHorizontal, Trophy, Users } from 'lucide-react';
import type { DiscoverItem } from '@/lib/types';
import { RatingDisplay } from './rating-slider';

export function DiscoverGameCard({ item, inMyGames, inRanking, onAddToMyGames, onAddToRanking }: {
  item: DiscoverItem;
  inMyGames: boolean;
  inRanking: boolean;
  onAddToMyGames: () => void;
  onAddToRanking: () => void;
}) {
  const { game } = item;
  return (
    <article className="discover-game-card group relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
      <header className="favorite-game-header flex min-h-10 items-center gap-1.5 px-2 py-1.5 pr-9">
        <Link href={`/jogos/${game.id}`} className="min-w-0 flex-1 truncate text-[10px] font-extrabold text-zinc-100 transition group-hover:text-violet-300">{game.title}</Link>
      </header>
      <div className="discover-poster poster-card-cover relative aspect-[264/374] overflow-hidden bg-zinc-900">
        <Link href={`/jogos/${game.id}`} className="block size-full"><img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover transition duration-500 group-hover:scale-[1.035]" /></Link>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/15 opacity-75" />
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 text-[9px] font-bold text-white/85">
          {item.activityCount ? <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 backdrop-blur"><Users className="size-3" />{item.activityCount}</span> : <span />}
          {game.average_rating != null && <span className="inline-flex items-center rounded-full bg-black/65 px-2 py-1 text-amber-300 backdrop-blur"><RatingDisplay value={game.average_rating / 10} className="text-[9px]" /></span>}
        </div>
      </div>
      <footer className="favorite-game-footer flex min-h-9 min-w-0 items-center gap-1.5 px-2 py-1.5 text-[9px] font-bold text-zinc-500"><span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{game.duration_hours} h</span>{!!item.people?.length ? <span className="min-w-0 flex-1 truncate text-right">{item.people[0]}{item.people.length > 1 ? ` +${item.people.length - 1}` : ''}</span> : <span className="min-w-0 flex-1" />}{game.release_year && <span className="shrink-0 tabular-nums text-zinc-400">{game.release_year}</span>}</footer>
      <DropdownMenu.Root><DropdownMenu.Trigger aria-label={`Opções de ${game.title}`} className="discover-card-menu absolute right-1.5 top-1.5 z-10 grid size-7 place-items-center rounded-full border border-white/10 bg-black/75 text-white shadow-lg backdrop-blur-md"><MoreHorizontal className="size-3.5" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="app-popup animated-popup z-[120] min-w-56 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none"><DropdownMenu.Item disabled={inMyGames} onSelect={onAddToMyGames} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold outline-none data-[disabled]:text-emerald-300 data-[highlighted]:bg-white/8">{inMyGames ? <Check className="size-3.5" /> : <Library className="size-3.5" />}{inMyGames ? 'Em Meus Jogos' : 'Adicionar a Meus Jogos'}</DropdownMenu.Item><DropdownMenu.Item disabled={inRanking} onSelect={onAddToRanking} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold outline-none data-[disabled]:text-emerald-300 data-[highlighted]:bg-white/8">{inRanking ? <Check className="size-3.5" /> : <Trophy className="size-3.5" />}{inRanking ? 'No ranking deste mês' : 'Jogaria no ranking'}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    </article>
  );
}
