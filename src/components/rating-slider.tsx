'use client';

import { useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { ratingForScale, useRatingScale, type RatingScale } from '@/hooks/use-rating-scale';

function format(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(value) ? 0 : 1, maximumFractionDigits: 2 });
}

function FiveStars({ value, compact = false }: { value: number; compact?: boolean }) {
  const rounded = Math.round(Math.max(0, Math.min(5, value)) * 2) / 2;
  return <span aria-hidden="true" className={`rating-stars inline-grid grid-cols-5 ${compact ? 'w-[4.6rem] gap-0.5' : 'w-44 gap-1.5'}`}>
    {Array.from({ length: 5 }, (_, index) => {
      const fill = Math.max(0, Math.min(100, (rounded - index) * 100));
      return <span key={index} className="rating-star-empty relative block aspect-square min-w-0"><Star className="size-full" strokeWidth={1.8} /><span className="rating-star-fill pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - fill}% 0 0)` }}><Star className="size-full fill-current" strokeWidth={1.8} /></span></span>;
    })}
  </span>;
}

export function RatingDisplay({ value, className = '' }: { value: number; className?: string }) {
  const [scale] = useRatingScale();
  const shown = ratingForScale(value, scale);
  return <span className={`game-rating inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap ${className}`} aria-label={`Nota ${format(shown)} de ${scale}`}>
    {scale === 10 ? <Star aria-hidden="true" className="size-3.5 shrink-0 fill-current" /> : <FiveStars value={shown} compact />}
    <strong className="tabular-nums">{format(shown)}</strong>
  </span>;
}

export function RatingSlider({ value, onCommit, disabled = false, label }: {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const [scale] = useRatingScale();
  return <RatingSliderControl key={`${scale}:${value}`} initialValue={value} scale={scale} onCommit={onCommit} disabled={disabled} label={label} />;
}

function RatingSliderControl({ initialValue, scale, onCommit, disabled, label }: {
  initialValue: number;
  scale: RatingScale;
  onCommit: (value: number) => void;
  disabled: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState(initialValue);
  const [hover, setHover] = useState<number | null>(null);
  const lastCommitted = useRef(initialValue);
  const preview = hover ?? draft;
  const shown = ratingForScale(preview, scale);
  const max = scale;
  const displayStep = 0.5;

  function underlying(displayValue: number) {
    return scale === 5 ? displayValue * 2 : displayValue;
  }

  function pointerValue(event: React.PointerEvent<HTMLInputElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = ((event.clientX - rect.left) / rect.width) * max;
    return underlying(Math.max(0, Math.min(max, Math.round(raw / displayStep) * displayStep)));
  }

  function commit(next: number) {
    if (disabled || next === lastCommitted.current) return;
    lastCommitted.current = next;
    onCommit(next);
  }

  const input = <input
    type="range"
    min="0"
    max={max}
    step={displayStep}
    value={shown}
    disabled={disabled}
    aria-label={label}
    aria-valuetext={`${format(shown)} de ${scale}`}
    onChange={event => setDraft(underlying(Number(event.target.value)))}
    onPointerDown={event => { const next = pointerValue(event); event.currentTarget.setPointerCapture(event.pointerId); setHover(null); setDraft(next); }}
    onPointerMove={event => { if (disabled) return; const next = pointerValue(event); if (event.buttons === 1) setDraft(next); else setHover(next); }}
    onPointerUp={event => { const next = pointerValue(event); setDraft(next); setHover(null); commit(next); }}
    onPointerCancel={() => setHover(null)}
    onPointerLeave={() => setHover(null)}
    onBlur={event => { setHover(null); commit(underlying(Number(event.currentTarget.value))); }}
    onKeyUp={event => commit(underlying(Number(event.currentTarget.value)))}
  />;

  if (scale === 5) return <div className="rating-control mx-auto flex w-full max-w-[15rem] items-center gap-3"><div className="relative w-44 shrink-0 py-1"><FiveStars value={shown} /><span className="rating-hit-area absolute inset-0 [&>input]:size-full [&>input]:cursor-ew-resize [&>input]:opacity-0">{input}</span></div><output className="w-9 shrink-0 text-right text-base font-black tabular-nums text-amber-300">{format(shown)}</output></div>;

  const percentage = `${shown * 10}%`;
  return <div className="rating-control rating-control-ten min-w-0 flex-1">
    <div className="mb-2 flex items-end justify-between gap-3"><span className="text-[10px] font-bold text-zinc-600">0</span><output className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-lg font-black tabular-nums text-amber-300">{format(shown)}</output><span className="text-[10px] font-bold text-zinc-600">10</span></div>
    <div className="rating-range-wrap relative h-8" style={{ '--rating-progress': percentage } as React.CSSProperties}>{input}<div aria-hidden="true" className="rating-ticks pointer-events-none absolute inset-x-1 bottom-0 flex justify-between">{Array.from({ length: 11 }, (_, index) => <i key={index} className="block size-1 rounded-full bg-current" />)}</div></div>
  </div>;
}
