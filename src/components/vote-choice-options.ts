import { Minus, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import { voteChoiceLabels } from '@clube-do-jogo/domain';
import type { VoteChoice } from '@/lib/types';

/** Display order of the vote buttons, counts and participant tabs. */
export const voteChoiceOptions = [
  { value: 'would_not_play', label: voteChoiceLabels.would_not_play, Icon: ThumbsDown },
  { value: 'neutral', label: voteChoiceLabels.neutral, Icon: Minus },
  { value: 'would_play', label: voteChoiceLabels.would_play, Icon: ThumbsUp },
] as const satisfies ReadonlyArray<{ value: VoteChoice; label: string; Icon: LucideIcon }>;
