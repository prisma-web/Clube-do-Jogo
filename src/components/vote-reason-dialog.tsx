'use client';

import { useState } from 'react';
import { Check, MonitorX, RotateCcw, Tag, TextCursorInput } from 'lucide-react';
import type { VoteReason } from '@/lib/types';
import { Dialog, DialogContent } from './ui/dialog';

export const voteReasons = [
  { value: 'played_before', label: 'Já joguei e não quero de novo', Icon: RotateCcw },
  { value: 'cannot_run', label: 'Não consigo rodar', Icon: MonitorX },
  { value: 'too_expensive', label: 'Muito caro', Icon: Tag },
  { value: 'other', label: 'Outro', Icon: TextCursorInput },
] as const;

export function voteReasonLabel(reason?: VoteReason | null) {
  return voteReasons.find(option => option.value === reason)?.label || 'Sem motivo informado';
}

function ReasonForm({ initialReason, initialText, onCancel, onConfirm }: {
  initialReason?: VoteReason | null;
  initialText?: string | null;
  onCancel: () => void;
  onConfirm: (reason: VoteReason, text: string | null) => void;
}) {
  const [reason, setReason] = useState<VoteReason | null>(initialReason || null);
  const [text, setText] = useState(initialText || '');
  const valid = Boolean(reason) && (reason !== 'other' || Boolean(text.trim()));

  return <div className="space-y-2 p-4">
    {voteReasons.map(option => {
      const selected = reason === option.value;
      return <button key={option.value} type="button" onClick={() => setReason(option.value)} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 text-left text-xs font-bold transition ${selected ? 'border-red-400/35 bg-red-500/10 text-red-200' : 'border-white/8 bg-white/[.025] text-zinc-300 hover:bg-white/5'}`}>
        <option.Icon className="size-4 shrink-0" /><span className="min-w-0 flex-1">{option.label}</span>{selected && <Check className="size-4 shrink-0" />}
      </button>;
    })}
    {reason === 'other' && <label className="block pt-2"><textarea autoFocus maxLength={150} rows={3} value={text} onChange={event => setText(event.target.value)} placeholder="Conte o motivo" className="w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm outline-none transition focus:border-red-400/35" /><span className="mt-1 block text-right text-[9px] font-bold tabular-nums text-zinc-600">{text.length}/150</span></label>}
    <div className="flex gap-2 pt-3"><button type="button" onClick={onCancel} className="h-11 flex-1 rounded-xl bg-white/5 text-xs font-bold text-zinc-300">Cancelar</button><button type="button" disabled={!valid} onClick={() => reason && onConfirm(reason, reason === 'other' ? text.trim() : null)} className="h-11 flex-1 rounded-xl bg-red-600 text-xs font-extrabold text-white disabled:opacity-40">Confirmar Não</button></div>
  </div>;
}

export function VoteReasonDialog({ open, initialReason, initialText, onOpenChange, onConfirm }: {
  open: boolean;
  initialReason?: VoteReason | null;
  initialText?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: VoteReason, text: string | null) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Por que você não jogaria?">
    {open && <ReasonForm key={`${initialReason || 'new'}:${initialText || ''}`} initialReason={initialReason} initialText={initialText} onCancel={() => onOpenChange(false)} onConfirm={onConfirm} />}
  </DialogContent></Dialog>;
}
