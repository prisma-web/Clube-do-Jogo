'use client';

import { Circle, Flag, PlayCircle } from 'lucide-react';
import type { Game, ProgressStatus } from '@/lib/types';
import { Dialog, DialogClose, DialogContent } from './ui/dialog';
import { GameDialogPreview } from './game-dialog-preview';

const meta = {
  not_started: { label: 'Não iniciado', Icon: Circle },
  started: { label: 'Comecei', Icon: PlayCircle },
  finished: { label: 'Finalizado', Icon: Flag },
} as const;

export function ProgressConfirmationDialog({ open, onOpenChange, game, currentStatus, targetStatus, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: Game | null;
  currentStatus: ProgressStatus;
  targetStatus: ProgressStatus;
  onConfirm: () => void;
}) {
  if (!game) return null;
  const target = meta[targetStatus];
  const TargetIcon = target.Icon;
  const destructive = targetStatus === 'not_started';
  const message = destructive
    ? 'A data de início, a data de fim e sua avaliação serão apagadas.'
    : currentStatus === 'finished' && targetStatus === 'started'
      ? 'A data de início será preservada. A data de finalização será removida.'
      : targetStatus === 'finished'
        ? 'A data de início existente será preservada.'
        : 'A data de início será registrada apenas se ainda não existir.';
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title={`Marcar como ${target.label}`} className="max-w-sm">
      <GameDialogPreview game={game} message={message} />
      <div className="flex gap-2 p-4"><DialogClose className="h-10 flex-1 rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-300">Cancelar</DialogClose><DialogClose onClick={onConfirm} className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-extrabold text-white ${destructive ? 'bg-red-600' : 'bg-violet-600'}`}><TargetIcon className="size-3.5" />Confirmar</DialogClose></div>
    </DialogContent>
  </Dialog>;
}
