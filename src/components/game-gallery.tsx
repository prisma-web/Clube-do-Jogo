'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';

export function ImageGalleryDialog({ title, images, open, onOpenChange, activeIndex, onActiveIndexChange }: {
  title: string;
  images: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const panStart = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const selectImage = useCallback((index: number) => { setZoom(1); setPan({ x: 0, y: 0 }); onActiveIndexChange(index); }, [onActiveIndexChange]);
  const previous = useCallback(() => selectImage((activeIndex - 1 + images.length) % images.length), [activeIndex, images.length, selectImage]);
  const next = useCallback(() => selectImage((activeIndex + 1) % images.length), [activeIndex, images.length, selectImage]);

  const constrainPan = useCallback((x: number, y: number, scale = zoom) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image || scale <= 1) return { x: 0, y: 0 };
    const maxX = Math.max(0, (image.offsetWidth * scale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - viewport.clientHeight) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }, [zoom]);

  const changeZoom = useCallback((nextZoom: number) => {
    const value = Math.max(1, Math.min(3, Number(nextZoom.toFixed(2))));
    setZoom(value);
    setPan(current => constrainPan(current.x, current.y, value));
  }, [constrainPan]);
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay gallery-overlay animated-overlay fixed inset-0 z-[90] bg-black/90 backdrop-blur-md" />
        <Dialog.Content className="animated-modal fixed left-1/2 top-1/2 z-[91] flex max-h-[96dvh] w-[calc(100%-1rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-3 outline-none">
          <Dialog.Title className="sr-only">Galeria de {title}</Dialog.Title>
          <Dialog.Description className="sr-only">Imagem {activeIndex + 1} de {images.length}. Use as setas para navegar. Ao ampliar, arraste a imagem para explorar.</Dialog.Description>
          <div
            ref={viewportRef}
            className={`gallery-viewport relative flex h-[min(72dvh,760px)] min-h-0 w-full flex-none touch-none items-center justify-center overflow-hidden rounded-2xl ${zoom > 1 ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
            onPointerDown={event => {
              if (zoom > 1) {
                event.currentTarget.setPointerCapture(event.pointerId);
                panStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
                setPanning(true);
              } else {
                pointerStart.current = event.clientX;
              }
            }}
            onPointerMove={event => {
              const start = panStart.current;
              if (!start || start.pointerId !== event.pointerId) return;
              event.preventDefault();
              setPan(constrainPan(start.panX + event.clientX - start.x, start.panY + event.clientY - start.y));
            }}
            onPointerUp={event => {
              if (panStart.current?.pointerId === event.pointerId) {
                panStart.current = null;
                setPanning(false);
                event.currentTarget.releasePointerCapture(event.pointerId);
                return;
              }
              if (pointerStart.current === null) return;
              const distance = event.clientX - pointerStart.current;
              if (Math.abs(distance) > 45) {
                if (distance > 0) previous();
                else next();
              }
              pointerStart.current = null;
            }}
            onPointerCancel={() => { pointerStart.current = null; panStart.current = null; setPanning(false); }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={images[activeIndex]} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.99 }} transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }} className="flex size-full items-center justify-center">
                <img ref={imageRef} draggable={false} src={images[activeIndex]} alt={`Imagem ${activeIndex + 1} de ${title}`} style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }} className={`max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl ${panning ? '' : 'transition-transform duration-150 ease-[cubic-bezier(.22,1,.36,1)]'}`} />
              </motion.div>
            </AnimatePresence>
            {images.length > 1 && <>
              <button onClick={previous} aria-label="Imagem anterior" className="absolute left-1 grid size-11 cursor-pointer place-items-center text-white drop-shadow-lg transition hover:scale-110 sm:left-3"><ChevronLeft className="size-8" /></button>
              <button onClick={next} aria-label="Próxima imagem" className="absolute right-1 grid size-11 cursor-pointer place-items-center text-white drop-shadow-lg transition hover:scale-110 sm:right-3"><ChevronRight className="size-8" /></button>
            </>}
            <Dialog.Close aria-label="Fechar galeria" className="absolute right-1 top-1 grid size-10 cursor-pointer place-items-center text-white/75 drop-shadow-lg transition hover:text-white sm:right-3 sm:top-3"><X className="size-6" /></Dialog.Close>
          </div>
          <div className="gallery-toolbar flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-white/10 bg-black/70 p-1 text-white shadow-lg">
            <button onClick={() => changeZoom(zoom - .25)} disabled={zoom <= 1} aria-label="Reduzir zoom" className="grid size-9 cursor-pointer place-items-center rounded-lg transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30"><ZoomOut className="size-4" /></button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} disabled={zoom === 1} aria-label="Restaurar zoom" className="grid h-9 min-w-14 cursor-pointer place-items-center rounded-lg px-2 text-[10px] font-bold tabular-nums transition hover:bg-white/10 disabled:cursor-default disabled:text-white/65">{Math.round(zoom * 100)}%</button>
            <button onClick={() => changeZoom(zoom + .25)} disabled={zoom >= 3} aria-label="Ampliar zoom" className="grid size-9 cursor-pointer place-items-center rounded-lg transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30"><ZoomIn className="size-4" /></button>
            {zoom > 1 && <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="hidden border-l border-white/10 pl-3 pr-2 text-[10px] font-semibold text-white/65 sm:block">Arraste para explorar</motion.span>}
          </div>
          {images.length > 1 && <div className="flex max-w-full gap-2 overflow-x-auto px-1 pb-1">
            {images.map((url, index) => <button key={`${url}-${index}`} onClick={() => selectImage(index)} aria-label={`Abrir imagem ${index + 1}`} className={`h-14 w-20 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition ${index === activeIndex ? 'border-white' : 'border-transparent opacity-55 hover:opacity-100'}`}><img src={url} alt="" className="size-full object-cover" /></button>)}
          </div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function GameGallery({ title, images }: { title: string; images: string[] }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [gallerySession, setGallerySession] = useState(0);
  const visible = images.slice(0, 2);
  const remaining = Math.max(images.length - 2, 0);

  const show = (index: number) => {
    setActiveIndex(index);
    setGallerySession(session => session + 1);
    setOpen(true);
  };
  if (!images.length) return null;

  return (
    <>
      <div className={`grid gap-3 ${visible.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {visible.map((url, index) => (
          <button key={url} onClick={() => show(index)} className="game-media-card group relative aspect-video min-w-0 overflow-hidden rounded-2xl border border-white/8 bg-zinc-900">
            <img src={url} alt={`Cena ${index + 1} de ${title}`} className="size-full object-cover transition duration-300 group-hover:scale-105" />
            {index === 1 && remaining > 0 && <span className="gallery-more absolute inset-0 grid place-items-center bg-black/55 text-2xl font-black text-white backdrop-blur-[2px]">+{remaining}</span>}
          </button>
        ))}
      </div>

      <ImageGalleryDialog key={gallerySession} title={title} images={images} open={open} onOpenChange={setOpen} activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} />
    </>
  );
}
