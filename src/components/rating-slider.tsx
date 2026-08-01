'use client';

import { useRef, useState } from 'react';
import { Star } from 'lucide-react';

function Stars({ value, compact = false }: { value: number; compact?: boolean }) {
  const normalized = Math.max(0, Math.min(10, value));
  return (
    <span aria-hidden="true" className={`rating-stars grid grid-cols-10 ${compact ? 'w-28 gap-0.5' : 'w-full gap-1'}`}>
      {Array.from({ length: 10 }, (_, index) => {
        const fill = Math.max(0, Math.min(100, (normalized - index) * 100));
        return <span key={index} className="relative block aspect-square min-w-0 text-zinc-700"><Star className="size-full" strokeWidth={1.8} /><span className="pointer-events-none absolute inset-0 overflow-hidden text-amber-400" style={{ clipPath: `inset(0 ${100 - fill}% 0 0)` }}><Star className="size-full fill-current" strokeWidth={1.8} /></span></span>;
      })}
    </span>
  );
}

export function RatingStars({ value }: { value: number }) {
  return <Stars value={value} compact />;
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
  const [hover, setHover] = useState<number | null>(null);
  const lastCommitted = useRef(initialValue);

  function pointerValue(event: React.PointerEvent<HTMLInputElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = ((event.clientX - rect.left) / rect.width) * 10;
    return Math.max(0, Math.min(10, Math.round(raw * 2) / 2));
  }

  function commit(next: number) {
    if (disabled || next === lastCommitted.current) return;
    lastCommitted.current = next;
    onCommit(next);
  }

  const preview = hover ?? draft;
  return (
    <div className="rating-control flex min-w-0 flex-1 items-center gap-2.5">
      <div className="relative min-w-0 flex-1 py-1">
        <Stars value={preview} />
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
          onPointerDown={event => {
            const next = pointerValue(event);
            event.currentTarget.setPointerCapture(event.pointerId);
            setHover(null);
            setDraft(next);
          }}
          onPointerMove={event => {
            if (disabled) return;
            const next = pointerValue(event);
            if (event.buttons === 1) setDraft(next);
            else setHover(next);
          }}
          onPointerUp={event => {
            const next = pointerValue(event);
            setDraft(next);
            setHover(null);
            commit(next);
          }}
          onPointerCancel={() => setHover(null)}
          onPointerLeave={() => setHover(null)}
          onBlur={event => { setHover(null); commit(Number(event.currentTarget.value)); }}
          onKeyUp={event => commit(Number(event.currentTarget.value))}
          className="absolute inset-0 size-full cursor-ew-resize opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      <output className="w-10 shrink-0 text-right text-lg font-black tabular-nums text-amber-300">{preview.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</output>
    </div>
  );
}
