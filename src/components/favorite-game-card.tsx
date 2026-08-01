import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import type { Game } from '@/lib/types';
import { RatingDisplay } from './rating-slider';

export function FavoriteGameCard({ game }: { game: Game }) {
  return (
    <article className="favorite-game-card group min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
      <header className="favorite-game-header flex min-h-10 items-center gap-1.5 px-2 py-1.5">
        <Link href={`/jogos/${game.id}`} className="min-w-0 flex-1 truncate text-[10px] font-extrabold leading-snug text-zinc-100 transition group-hover:text-violet-300">{game.title}</Link>
      </header>
      <Link href={`/jogos/${game.id}`} className="favorite-game-cover poster-card-cover relative block aspect-[264/374] overflow-hidden bg-zinc-900">
        <img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover transition duration-500 group-hover:scale-[1.035]" />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/15 opacity-75" />
        {game.average_rating != null && <span className="absolute bottom-2 right-2 inline-flex items-center rounded-full bg-black/65 px-2 py-1 text-[9px] font-bold text-amber-300 backdrop-blur"><RatingDisplay value={game.average_rating / 10} className="text-[9px]" /></span>}
      </Link>
      <footer className="favorite-game-footer flex min-h-9 items-center justify-between gap-2 px-2 py-1.5 text-[9px] font-bold text-zinc-500">
        <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{game.duration_hours} h</span>
        {game.release_year && <span className="shrink-0 tabular-nums text-zinc-400">{game.release_year}</span>}
      </footer>
    </article>
  );
}
