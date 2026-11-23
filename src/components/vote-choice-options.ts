import { Minus, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import type { VoteChoice } from '@/lib/types';

/** Display order of the vote buttons, counts and participant tabs. */
export const voteChoiceOptions = [
  { value: 'would_not_play', label: 'Não', Icon: ThumbsDown },
  { value: 'neutral', label: 'Neutro', Icon: Minus },
  { value: 'would_play', label: 'Jogaria', Icon: ThumbsUp },
] as const satisfies ReadonlyArray<{ value: VoteChoice; label: string; Icon: LucideIcon }>;
