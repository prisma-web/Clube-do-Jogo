import Link from 'next/link';
import { CalendarDays, Clock3 } from 'lucide-react';
import type { Game } from '@/lib/types';
import { RatingDisplay } from './rating-slider';

export function FavoriteGameCard({ game }: { game: Game }) {
  return (
    <article className="favorite-game-card group min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
      <header className="favorite-game-header flex min-h-10 items-center justify-between gap-1.5 px-2 py-1.5">
        <Link href={`/jogos/${game.id}`} className="truncate text-[10px] font-extrabold leading-snug text-zinc-100 transition group-hover:text-violet-300">{game.title}</Link>
        {game.release_year && <span className="shrink-0 text-[9px] font-extrabold tabular-nums text-zinc-400">{game.release_year}</span>}
      </header>
      <Link href={`/jogos/${game.id}`} className="favorite-game-cover relative block aspect-[3/4] overflow-hidden bg-zinc-900">
        <img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover transition duration-500 group-hover:scale-[1.035]" />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/[0.04] opacity-70" />
      </Link>
      <footer className="favorite-game-footer flex min-h-9 items-center justify-between gap-2 px-2 py-1.5 text-[9px] font-bold text-zinc-500">
        <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{game.duration_hours} h</span>
        {game.average_rating != null
          ? <RatingDisplay value={game.average_rating / 10} className="text-[9px]" />
          : game.release_year && <CalendarDays className="size-3" />}
      </footer>
    </article>
  );
}
