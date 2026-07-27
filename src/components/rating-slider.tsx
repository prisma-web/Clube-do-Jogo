'use client';

import { useRef, useState } from 'react';
import { Star } from 'lucide-react';

function Stars({ value, size = 'size-5' }: { value: number; size?: string }) {
  const percentage = Math.max(0, Math.min(100, value * 10));
  return <span aria-hidden="true" className="relative flex w-fit">
    <span className="flex text-zinc-700">{Array.from({ length: 5 }, (_, index) => <Star key={index} className={size} strokeWidth={1.8} />)}</span>
    <span className="pointer-events-none absolute inset-0 flex text-amber-400" style={{ clipPath: `inset(0 ${100 - percentage}% 0 0)` }}>{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`${size} fill-current`} strokeWidth={1.8} />)}</span>
  </span>;
}

export function RatingStars({ value, size = 'size-3.5' }: { value: number; size?: string }) {
  return <Stars value={value} size={size} />;
}

export function RatingSlider({ value, onCommit, disabled = false, label }: {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return <RatingSliderControl key={value} initialValue={value} onCommit={onCommit} disabled={disabled} label={label} />;
}

function RatingSliderControl({ initialValue, onCommit, disabled, label }: {
  initialValue: number;
  onCommit: (value: number) => void;
  disabled: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState(initialValue);
  const lastCommitted = useRef(initialValue);

  function commit(next: number) {
    if (disabled || next === lastCommitted.current) return;
    lastCommitted.current = next;
    onCommit(next);
  }

  return <div className="flex min-w-0 flex-1 items-center gap-3">
    <div className="relative h-8 w-36 shrink-0">
      <Stars value={draft} size="size-8 -ml-1 first:ml-0" />
      <input
        type="range"
        min="0"
        max="10"
        step="0.5"
        value={draft}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${draft.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} de 10`}
        onChange={event => setDraft(Number(event.target.value))}
        onPointerUp={event => commit(Number(event.currentTarget.value))}
        onBlur={event => commit(Number(event.currentTarget.value))}
        onKeyUp={event => commit(Number(event.currentTarget.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
    <output className="w-12 text-right text-xl font-black tabular-nums text-amber-300">{draft.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</output>
  </div>;
}
