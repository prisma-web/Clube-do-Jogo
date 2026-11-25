import { Minus, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import { voteChoiceLabels, voteChoices } from '@clube-do-jogo/domain';
import type { VoteChoice } from '@/lib/types';

const icons: Record<VoteChoice, LucideIcon> = { would_not_play: ThumbsDown, neutral: Minus, would_play: ThumbsUp };

/** The vote buttons, counts and participant tabs, in `voteChoices` order. */
export const voteChoiceOptions = voteChoices.map(value => ({ value, label: voteChoiceLabels[value], Icon: icons[value] }));
