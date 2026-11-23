'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { TgaEmblem } from './tga-emblem';

export function GotyFloatingBadge({ navVisible }: { navVisible: boolean }) {
  const pathname = usePathname();

  if (pathname === '/goty-2026' || pathname.startsWith('/goty-2026/')) {
    return null;
  }

  return (
    <Link
      href="/goty-2026"
      scroll={false}
      aria-label="Abrir experiência especial GOTY 2026"
      title="GOTY 2026 · Bolão e Seu GOTY"
      className={cn(
        'goty-fab group fixed right-3.5 z-[60] flex items-center gap-2.5 rounded-full border border-[#e3c168]/45 bg-[#0c0b10]/95 p-1.5 pr-3.5 text-[#faf2d8] shadow-[0_14px_38px_rgba(0,0,0,0.68),0_0_24px_rgba(218,176,72,0.22)] backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:border-[#f4d98d]/75 hover:shadow-[0_18px_46px_rgba(0,0,0,0.75),0_0_32px_rgba(232,193,92,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1d37e] active:scale-[0.97] sm:right-6',
        navVisible
          ? 'bottom-[calc(4.9rem+env(safe-area-inset-bottom))] min-[960px]:bottom-6'
          : 'bottom-[max(1rem,env(safe-area-inset-bottom))] min-[960px]:bottom-6',
      )}
    >
      <span className="goty-fab-glow pointer-events-none absolute -inset-px rounded-full" aria-hidden="true" />
      <span className="relative grid size-9 shrink-0 place-items-center rounded-full border border-[#f2d687]/40 bg-gradient-to-br from-[#2d2311] via-[#14110c] to-[#09090c] shadow-[inset_0_1px_1px_rgba(255,244,200,0.35)]">
        <TgaEmblem className="size-5 transition-transform duration-300 group-hover:scale-110" />
      </span>
      <span className="relative flex flex-col leading-none">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#e5c46a]">
          Especial
        </span>
        <strong className="mt-0.5 text-xs font-black tracking-tight text-[#fff9e8]">
          GOTY 2026
        </strong>
      </span>
    </Link>
  );
}
