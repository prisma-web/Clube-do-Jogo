'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export function GameGallery({ title, images }: { title: string; images: string[] }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const visible = images.slice(0, 2);
  const remaining = Math.max(images.length - 2, 0);

  const show = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };
  const previous = useCallback(() => setActiveIndex(index => (index - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setActiveIndex(index => (index + 1) % images.length), [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, open, previous]);

  if (!images.length) return null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className={`grid gap-3 ${visible.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {visible.map((url, index) => (
          <button key={url} onClick={() => show(index)} className="group relative aspect-video min-w-0 overflow-hidden rounded-2xl border border-white/8 bg-zinc-900">
            <img src={url} alt={`Cena ${index + 1} de ${title}`} className="size-full object-cover transition duration-300 group-hover:scale-105" />
            {index === 1 && remaining > 0 && <span className="absolute inset-0 grid place-items-center bg-black/55 text-2xl font-black text-white backdrop-blur-[2px]">+{remaining}</span>}
          </button>
        ))}
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="animated-overlay fixed inset-0 z-[90] bg-black/90 backdrop-blur-md" />
        <Dialog.Content className="animated-modal fixed left-1/2 top-1/2 z-[91] flex max-h-[96dvh] w-[calc(100%-1rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-3 outline-none">
          <Dialog.Title className="sr-only">Galeria de {title}</Dialog.Title>
          <Dialog.Description className="sr-only">Imagem {activeIndex + 1} de {images.length}. Use as setas para navegar.</Dialog.Description>
          <div
            className="relative flex min-h-0 w-full flex-1 items-center justify-center"
            onPointerDown={event => { pointerStart.current = event.clientX; }}
            onPointerUp={event => {
              if (pointerStart.current === null) return;
              const distance = event.clientX - pointerStart.current;
              if (Math.abs(distance) > 45) {
                if (distance > 0) previous();
                else next();
              }
              pointerStart.current = null;
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.img key={images[activeIndex]} src={images[activeIndex]} alt={`Cena ${activeIndex + 1} de ${title}`} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.99 }} transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }} className="max-h-[78dvh] max-w-full select-none rounded-2xl object-contain shadow-2xl" />
            </AnimatePresence>
            {images.length > 1 && <>
              <button onClick={previous} aria-label="Imagem anterior" className="absolute left-1 grid size-11 place-items-center text-white drop-shadow-lg transition hover:scale-110 sm:left-3"><ChevronLeft className="size-8" /></button>
              <button onClick={next} aria-label="Próxima imagem" className="absolute right-1 grid size-11 place-items-center text-white drop-shadow-lg transition hover:scale-110 sm:right-3"><ChevronRight className="size-8" /></button>
            </>}
            <Dialog.Close aria-label="Fechar galeria" className="absolute right-1 top-1 grid size-10 place-items-center text-white/75 drop-shadow-lg transition hover:text-white sm:right-3 sm:top-3"><X className="size-6" /></Dialog.Close>
          </div>
          {images.length > 1 && <div className="flex max-w-full gap-2 overflow-x-auto px-1 pb-1">
            {images.map((url, index) => <button key={`${url}-${index}`} onClick={() => setActiveIndex(index)} aria-label={`Abrir imagem ${index + 1}`} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${index === activeIndex ? 'border-white' : 'border-transparent opacity-55 hover:opacity-100'}`}><img src={url} alt="" className="size-full object-cover" /></button>)}
          </div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
