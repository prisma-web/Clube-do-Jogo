import { demoRanking as buildDemoRanking } from '@clube-do-jogo/domain/demo';
import { ACTIVE_RANKING_FORMULA } from './ranking';

export {
  demoComments,
  demoGames,
  demoMonths,
  demoProfiles,
  demoProgress,
} from '@clube-do-jogo/domain/demo';

export function demoRanking() {
  return buildDemoRanking(ACTIVE_RANKING_FORMULA);
}
