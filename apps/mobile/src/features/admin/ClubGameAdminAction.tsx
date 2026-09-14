import { useState } from 'react';
import { Alert } from 'react-native';
import type { Game } from '@clube-do-jogo/domain';
import { formatMonth } from '@/lib/format';
import { useApp } from '@/state/app-provider';
import { ClubGameChangeSheet } from './ClubGameChangeSheet';
import { usePersistedClubDecision } from './use-persisted-club-decision';

/**
 * Lets any screen open the same club-game change flow used by Configurações, preselected
 * for one game. Applied decisions land in the same persisted store AdminClubPanel reads, so
 * undo/redo/chain-continue stays the sole responsibility of AdminClubPanel's DecisionBanner —
 * this hook only ever applies, it never previews, undoes, or redoes a decision.
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
      onApplied={result => {
        setDecision({ kind: 'applied', result });
        setTargetGame(null);
        Alert.alert(
          'Jogo do clube atualizado',
          `Definido para o ciclo de ${formatMonth(result.month)}. Para desfazer, acesse Configurações › Administração.`,
        );
      }}
    />
  ) : null;

  return { openFor: (game: Game) => setTargetGame(game), sheet };
}
