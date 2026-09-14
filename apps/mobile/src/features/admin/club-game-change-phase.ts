import type { ClubGameChangePreview } from '@clube-do-jogo/data';
import type { Game } from '@clube-do-jogo/domain';

export type ClubGameChangePhase =
  | { step: 'pick-game' }
  | { step: 'choose-mode'; game: Game }
  | { step: 'confirm'; game: Game; preview: ClubGameChangePreview };

export function initialPhaseFor(game: Game | undefined): ClubGameChangePhase {
  return game ? { step: 'choose-mode', game } : { step: 'pick-game' };
}
