'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppBackButton({ fallbackHref = '/jogo-do-mes', className }: { fallbackHref?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.state?.__clubeHasAppBack) router.back();
        else router.replace(fallbackHref);
      }}
      className={cn('inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-400 hover:bg-white/10 hover:text-white', className)}
    >
      <ArrowLeft className="size-4" />Voltar
    </button>
  );
}
