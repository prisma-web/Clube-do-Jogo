import { useState } from 'react';
import type { Game } from '@clube-do-jogo/domain';
import { useApp } from '@/state/app-provider';
import { ClubGameChangeSheet } from './ClubGameChangeSheet';
import { usePersistedClubDecision } from './use-persisted-club-decision';

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
