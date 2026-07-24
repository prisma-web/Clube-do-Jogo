'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { Check, Gift, Sparkles, X } from 'lucide-react';
import type { RewardGrant } from '@/lib/types';
import { formatMonth } from '@/lib/utils';
import { isThemeId } from '@/lib/themes';

const confetti = [
  { x: '8%', delay: 0, color: 'var(--reward-accent)' },
  { x: '18%', delay: 0.18, color: 'var(--reward-accent-soft)' },
  { x: '31%', delay: 0.08, color: 'var(--reward-accent)' },
  { x: '45%', delay: 0.28, color: 'var(--reward-accent-soft)' },
  { x: '59%', delay: 0.12, color: 'var(--reward-accent)' },
  { x: '72%', delay: 0.34, color: 'var(--reward-accent-soft)' },
  { x: '84%', delay: 0.05, color: 'var(--reward-accent)' },
  { x: '93%', delay: 0.24, color: 'var(--reward-accent-soft)' },
];

export function RewardCelebration({
  grant,
  onAcknowledge,
  onUseTheme,
}: {
  grant: RewardGrant;
  onAcknowledge: () => Promise<void>;
  onUseTheme: (themeId: string) => Promise<void>;
}) {
  const month = formatMonth(grant.reward.cycle?.month || grant.reward.club_month, { includeYear: false });
  const gameTitle = grant.reward.cycle?.game?.title || 'o jogo do clube';
  const canUseTheme = grant.reward.kind === 'theme' && isThemeId(grant.reward.theme_id);
  const imageUrl = grant.reward.image_url || '/reward-unlock.svg';

  return (
    <DialogPrimitive.Root open onOpenChange={open => {
      if (!open) void onAcknowledge();
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="reward-overlay animated-overlay fixed inset-0 z-[320] bg-black/80 backdrop-blur-md" />
        <DialogPrimitive.Content className="reward-dialog animated-modal fixed left-1/2 top-1/2 z-[321] max-h-[min(92dvh,760px)] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[32px] border border-white/10 bg-zinc-950 px-5 pb-5 pt-6 text-center shadow-2xl outline-none sm:px-8 sm:pb-7 sm:pt-8">
          <div className="reward-rays pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="reward-confetti pointer-events-none absolute inset-x-0 top-0 h-44 overflow-hidden" aria-hidden="true">
            {confetti.map((piece, index) => (
              <motion.span
                key={index}
                className="absolute top-[-12px] h-3 w-1.5 rounded-full"
                style={{ left: piece.x, background: piece.color }}
                initial={{ y: -12, opacity: 0, rotate: 0 }}
                animate={{ y: 160, opacity: [0, 1, 1, 0], rotate: 260 + index * 34 }}
                transition={{ duration: 2.4 + (index % 3) * 0.3, delay: piece.delay, repeat: Infinity, repeatDelay: 0.8, ease: 'easeOut' }}
              />
            ))}
          </div>

          <DialogPrimitive.Close aria-label="Fechar" className="reward-close absolute right-3 top-3 z-20 grid size-9 place-items-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-50 active:scale-95">
            <X className="size-4" />
          </DialogPrimitive.Close>

          <div className="relative z-10">
            <motion.div
              initial={{ scale: 0.35, rotate: -14, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.08 }}
              className="reward-badge mx-auto grid size-12 place-items-center rounded-2xl"
              aria-hidden="true"
            >
              <Gift className="size-6" />
            </motion.div>

            <div className="reward-eyebrow mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em]">
              <Sparkles className="size-3.5" />
              Conquista desbloqueada
            </div>
            <DialogPrimitive.Title className="reward-title mx-auto mt-2 max-w-sm text-2xl font-black leading-tight tracking-[-0.035em] text-zinc-50 sm:text-3xl">
              Você recebeu uma recompensa!
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="reward-description mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-400 sm:text-sm">
              Por ter finalizado o jogo de {month}: <strong>{gameTitle}</strong>.
            </DialogPrimitive.Description>

            <motion.div
              initial={{ y: 18, scale: 0.92, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.2 }}
              className="reward-art relative mx-auto my-5 grid aspect-[4/3] w-full max-w-[250px] place-items-center overflow-hidden rounded-[28px]"
            >
              <div className="reward-art-glow absolute inset-0" aria-hidden="true" />
              <img src={imageUrl} alt="" className="relative z-10 h-[82%] w-[82%] object-contain" />
            </motion.div>

            <div className="reward-card rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-left">
              <div className="flex items-start gap-3">
                <span className="reward-check mt-0.5 grid size-8 shrink-0 place-items-center rounded-full"><Check className="size-4" /></span>
                <div className="min-w-0">
                  <strong className="reward-name block text-sm text-zinc-100">{grant.reward.name}</strong>
                  <p className="reward-copy mt-1 text-[11px] leading-relaxed text-zinc-500">{grant.reward.description || 'Um novo item cosmético foi adicionado à sua coleção.'}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {canUseTheme && (
                <button onClick={() => void onUseTheme(grant.reward.theme_id!)} className="reward-primary h-12 rounded-xl bg-violet-600 text-xs font-extrabold text-white transition hover:bg-violet-500 active:scale-[0.98]">
                  Usar tema agora
                </button>
              )}
              <button onClick={() => void onAcknowledge()} className="reward-secondary h-11 rounded-xl bg-white/5 text-xs font-bold text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 active:scale-[0.98]">
                {canUseTheme ? 'Agora não' : 'Que demais!'}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
