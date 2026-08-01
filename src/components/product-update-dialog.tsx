'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Compass, Gamepad2, Library, Sparkles, Star, Trophy, X, Zap } from 'lucide-react';
import {
  currentProductUpdate,
  PRODUCT_UPDATE_EVENT,
  productUpdateStorageKey,
  type ProductUpdate,
  type ProductUpdateArtwork,
  type ProductUpdateImage,
} from '@/lib/product-updates';
import { demoGames } from '@/lib/demo-data';
import { cn } from '@/lib/utils';

export function openCurrentProductUpdate() {
  window.dispatchEvent(new CustomEvent(PRODUCT_UPDATE_EVENT, { detail: currentProductUpdate.id }));
}

export function ProductUpdateDialog({ update = currentProductUpdate }: { update?: ProductUpdate }) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const storageKey = productUpdateStorageKey(update.id);
  const step = update.steps[stepIndex];
  const finalStep = stepIndex === update.steps.length - 1;

  const showUpdate = useCallback(() => {
    setStepIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const requestedUpdate = searchParams.get('novidades');
    if (requestedUpdate === update.id || requestedUpdate === 'atual') {
      const requestedStep = Number(searchParams.get('passo'));
      const initialStep = Number.isInteger(requestedStep) && requestedStep > 0
        ? Math.min(update.steps.length - 1, requestedStep - 1)
        : 0;
      queueMicrotask(() => {
        setStepIndex(initialStep);
        setOpen(true);
      });
    } else if (window.localStorage.getItem(storageKey) !== 'true') {
      queueMicrotask(showUpdate);
    }
    const handleOpen = (event: Event) => {
      const requestedId = (event as CustomEvent<string>).detail;
      if (!requestedId || requestedId === update.id) showUpdate();
    };
    window.addEventListener(PRODUCT_UPDATE_EVENT, handleOpen);
    return () => window.removeEventListener(PRODUCT_UPDATE_EVENT, handleOpen);
  }, [showUpdate, storageKey, update.id, update.steps.length]);

  useEffect(() => {
    if (!open) return;
    update.steps.forEach(item => {
      const snapshot = document.createElement('img');
      if (item.image) snapshot.src = item.image.src;
    });
  }, [open, update.steps]);

  function finishUpdate() {
    window.localStorage.setItem(storageKey, 'true');
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="update-notes-overlay animated-overlay fixed inset-0 z-[380] bg-black/80 backdrop-blur-md" />
        <Dialog.Content className="update-notes-dialog fixed left-1/2 top-1/2 z-[381] flex max-h-[min(92dvh,820px)] w-[calc(100%-1rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 shadow-[0_32px_100px_rgba(0,0,0,.72)] outline-none sm:w-[calc(100%-2rem)]">
          <Dialog.Title className="sr-only">{update.title}</Dialog.Title>
          <Dialog.Description className="sr-only">Conheça as novidades desta versão do Clube do Jogo.</Dialog.Description>

          <header className="update-notes-header flex shrink-0 items-center gap-3 border-b border-white/8 px-4 py-3 sm:px-6">
            <div className="update-notes-mark grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300"><Gamepad2 className="size-4.5" /></div>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-black text-zinc-100">{update.title}</strong>
              <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[.16em] text-zinc-600">Novidades do Clube do Jogo</span>
            </div>
            <span className="hidden text-[10px] font-extrabold tabular-nums text-zinc-500 min-[390px]:block">{stepIndex + 1} de {update.steps.length}</span>
            <Dialog.Close aria-label="Fechar novidades" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-500 outline-none transition hover:bg-white/10 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-400/45 active:scale-95"><X className="size-4" /></Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={stepIndex}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="grid min-h-full lg:grid-cols-[1.12fr_.88fr]"
              >
                <div className="update-notes-visual-wrap min-h-[240px] p-3 sm:min-h-[310px] sm:p-5 lg:min-h-[510px] lg:p-6">
                  {step.image ? <UpdateSnapshot image={step.image} /> : <UpdateArtwork artwork={step.artwork || 'overview'} />}
                </div>
                <div className="update-notes-copy flex flex-col justify-center px-5 pb-7 pt-4 sm:px-8 sm:pb-9 lg:px-9 lg:py-12">
                  <span className="text-[10px] font-black uppercase tracking-[.18em] text-violet-300">{step.eyebrow}</span>
                  <h2 className="mt-2.5 text-balance text-2xl font-black leading-[1.08] tracking-[-0.035em] text-zinc-50 sm:text-3xl">{step.title}</h2>
                  <p className="mt-4 text-sm leading-6 text-zinc-400">{step.body}</p>
                  {step.highlights && (
                    <ul className="mt-5 space-y-2.5">
                      {step.highlights.map(highlight => (
                        <li key={highlight} className="flex items-start gap-2.5 text-xs font-semibold leading-relaxed text-zinc-300">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-violet-300" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="update-notes-footer shrink-0 border-t border-white/8 px-4 pb-[max(.85rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
            <div className="mb-3 flex gap-1" aria-label={`Passo ${stepIndex + 1} de ${update.steps.length}`}>
              {update.steps.map((item, index) => (
                <button
                  key={`${item.eyebrow}-${index}`}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  aria-label={`Ir para o passo ${index + 1}: ${item.eyebrow}`}
                  aria-current={index === stepIndex ? 'step' : undefined}
                  className={cn('update-notes-progress h-1 flex-1 rounded-full transition', index <= stepIndex ? 'bg-violet-400' : 'bg-white/8')}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex(index => Math.max(0, index - 1))} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-xs font-extrabold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-0"><ArrowLeft className="size-4" />Anterior</button>
              {finalStep ? (
                <button type="button" onClick={finishUpdate} className="update-notes-primary inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-black text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-500 active:scale-[.98] sm:px-5">Explorar a {update.version}<Check className="size-4" /></button>
              ) : (
                <button type="button" onClick={() => setStepIndex(index => Math.min(update.steps.length - 1, index + 1))} className="update-notes-primary inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-xs font-black text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-500 active:scale-[.98]">Próximo<ArrowRight className="size-4" /></button>
              )}
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function UpdateSnapshot({ image }: { image: ProductUpdateImage }) {
  return (
    <figure className="update-visual update-real-snapshot relative isolate h-full min-h-[216px] overflow-hidden rounded-[24px] border border-white/8 bg-[#0b0b10] shadow-inner shadow-black/50 sm:min-h-[270px] lg:min-h-full">
      <Image
        src={image.src}
        alt={image.alt}
        fill
        unoptimized
        sizes="(min-width: 1024px) 460px, calc(100vw - 3.5rem)"
        className="object-cover"
        style={{ objectPosition: image.position || 'center' }}
      />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/28 via-transparent to-white/[0.03]" />
    </figure>
  );
}

function MiniPoster({ index }: { index: number }) {
  const game = demoGames[index];
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-xl shadow-black/40">
      <img src={game.image_url} alt="" className="size-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-2 pt-6 text-[8px] font-black text-white">{game.title}</span>
      {game.average_rating != null && <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-1 text-[7px] font-black text-amber-300"><Star className="size-2.5 fill-current" />{(game.average_rating / 10).toFixed(1).replace('.', ',')}</span>}
    </div>
  );
}

function UpdateArtwork({ artwork }: { artwork: ProductUpdateArtwork }) {
  if (artwork === 'performance') {
    const cards = [
      { label: 'Ranking', Icon: Trophy, width: '82%' },
      { label: 'Explorar', Icon: Compass, width: '68%' },
      { label: 'Meus Jogos', Icon: Library, width: '91%' },
    ];
    return (
      <div className="update-visual relative isolate flex h-full min-h-[216px] items-center justify-center overflow-hidden rounded-[24px] border border-violet-400/15 bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,.22),transparent_48%),linear-gradient(145deg,#171222,#09090d)] p-5 shadow-inner shadow-black/60 sm:min-h-[270px] lg:min-h-full">
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:26px_26px]" />
        <div className="relative w-full max-w-[330px] space-y-2.5">
          {cards.map(({ label, Icon, width }, index) => (
            <motion.div key={label} initial={{ opacity: 0, x: index % 2 ? 12 : -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }} className="rounded-2xl border border-white/10 bg-black/35 p-3 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 text-[10px] font-black text-zinc-200"><span className="grid size-7 place-items-center rounded-lg bg-violet-500/15 text-violet-300"><Icon className="size-3.5" /></span>{label}<CheckCircle2 className="ml-auto size-3.5 text-emerald-400" /></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7"><motion.div initial={{ width: 0 }} animate={{ width }} transition={{ delay: .18 + index * .08, duration: .55 }} className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400" /></div>
            </motion.div>
          ))}
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.12em] text-violet-200"><Zap className="size-3 fill-current" />Em evolução</div>
        </div>
      </div>
    );
  }

  return (
    <div className="update-visual relative isolate flex h-full min-h-[216px] items-center justify-center overflow-hidden rounded-[24px] border border-violet-400/15 bg-[radial-gradient(circle_at_25%_15%,rgba(217,70,239,.18),transparent_38%),radial-gradient(circle_at_80%_70%,rgba(124,58,237,.22),transparent_42%),#09090d] p-5 shadow-inner shadow-black/60 sm:min-h-[270px] lg:min-h-full">
      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(196,181,253,.45)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="relative w-full max-w-[350px]">
        <motion.div initial={{ opacity: 0, rotate: -4, x: -18 }} animate={{ opacity: 1, rotate: -4, x: 0 }} className="absolute -left-1 top-4 w-[58%] rounded-2xl border border-white/10 bg-zinc-950/90 p-3 shadow-2xl shadow-black/70">
          <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black text-violet-200"><Trophy className="size-3" />Ranking</div>
          <div className="grid grid-cols-2 gap-2"><MiniPoster index={1} /><MiniPoster index={3} /></div>
        </motion.div>
        <motion.div initial={{ opacity: 0, rotate: 4, x: 18 }} animate={{ opacity: 1, rotate: 4, x: 0 }} className="ml-auto mt-12 w-[62%] rounded-2xl border border-violet-400/20 bg-zinc-950/95 p-3 shadow-2xl shadow-violet-950/40">
          <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black text-violet-200"><Compass className="size-3" />Explorar</div>
          <div className="grid grid-cols-2 gap-2"><MiniPoster index={0} /><MiniPoster index={4} /></div>
        </motion.div>
        <span className="absolute -right-1 -top-1 inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/25 bg-fuchsia-500/15 px-3 py-1.5 text-[9px] font-black tracking-[.12em] text-fuchsia-200 shadow-lg shadow-fuchsia-950/40"><Sparkles className="size-3" />V1.1</span>
      </div>
    </div>
  );
}
