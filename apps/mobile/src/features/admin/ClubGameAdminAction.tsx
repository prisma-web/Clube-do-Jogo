import { useState } from 'react';
import type { Game } from '@clube-do-jogo/domain';
import { useApp } from '@/state/app-provider';
import { ClubGameChangeSheet } from './ClubGameChangeSheet';
import { usePersistedClubDecision } from './use-persisted-club-decision';

/**
 * Lets any screen open the same club-game change flow used by Configurações, preselected
 * for one game. The sheet keeps the whole decision inline (apply, undo, redo, continue undoing)
 * and every decision lands in the persisted store AdminClubPanel's DecisionBanner reads.
 */
export function useClubGameAdminAction() {
  const { userId, isDemo } = useApp();
  const { setDecision } = usePersistedClubDecision(userId, !isDemo);
  const [targetGame, setTargetGame] = useState<Game | null>(null);

  const sheet = targetGame ? (
    <ClubGameChangeSheet
      key={targetGame.id}
      visible
      initialGame={targetGame}
      onClose={() => setTargetGame(null)}
      onDecision={setDecision}
    />
  ) : null;

  return { openFor: (game: Game) => setTargetGame(game), sheet };
}
