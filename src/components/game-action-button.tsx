import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { CheckCircle2, Library, ThumbsUp } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

type ActionKind = 'vote' | 'completed' | 'backlog';

const meta = {
  vote: { Icon: ThumbsUp, idle: 'Votar', active: 'Votado', activeClass: 'border-violet-400/25 bg-violet-500/[.12] text-violet-200', fillClass: 'fill-violet-400/25' },
  completed: { Icon: CheckCircle2, idle: 'Finalizar', active: 'Finalizado', activeClass: 'border-emerald-400/25 bg-emerald-500/[.12] text-emerald-200', fillClass: 'fill-emerald-400/25' },
  backlog: { Icon: Library, idle: 'Adicionar ao backlog', active: 'No backlog', activeClass: 'border-sky-400/25 bg-sky-500/[.10] text-sky-200', fillClass: 'fill-sky-400/20' },
} as const;

export const GameActionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  kind: ActionKind;
  active: boolean;
  label?: string;
}>(function GameActionButton({ kind, active, label, className, ...props }, ref) {
  const config = meta[kind];
  const Icon = config.Icon;
  const reduceMotion = useReducedMotion();
  const stateKey = active ? 'active' : 'idle';
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 520, damping: 32, mass: 0.45 };
  return (
    <button
      ref={ref}
      className={cn(
        'relative isolate inline-flex min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-xl border px-3 text-[11px] font-extrabold transition duration-150 active:scale-[.97] disabled:opacity-55',
        active ? config.activeClass : 'border-white/10 bg-white/[.04] text-zinc-300 hover:border-white/15 hover:bg-white/[.08] hover:text-white',
        className,
      )}
      {...props}
    >
      <AnimatePresence initial={false}>
        {active && <motion.span key={`${kind}-glow`} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-white/[.045]" initial={{ opacity: 0, scale: 0.35 }} animate={{ opacity: [0, 1, 0], scale: 1.35 }} exit={{ opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.36, ease: [0.22, 1, 0.36, 1] }} />}
      </AnimatePresence>
      <span className="relative grid size-3.5 shrink-0 place-items-center">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={`${kind}-${stateKey}-icon`} className="absolute inset-0 grid place-items-center" initial={reduceMotion ? false : { opacity: 0, scale: 0.4, rotate: active ? -24 : 24 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={reduceMotion ? undefined : { opacity: 0, scale: 0.4, rotate: active ? 24 : -24 }} transition={transition}>
            <Icon className={cn('size-3.5', active && config.fillClass)} />
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="relative min-w-0 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={`${kind}-${stateKey}-${label || ''}`} className="block truncate" initial={reduceMotion ? false : { opacity: 0, y: active ? 7 : -7 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: active ? -7 : 7 }} transition={transition}>{label || (active ? config.active : config.idle)}</motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
});
