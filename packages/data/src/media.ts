import type { Game, GameMugshot } from '@clube-do-jogo/domain';
import type { DataScope } from './client';

export interface GameMediaQuery extends DataScope {
  gameId: string;
}

export type { Game, GameMugshot };
