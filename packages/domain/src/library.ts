import type { LibraryGame, ProgressStatus } from './types';

export type LibraryQuickFilter = 'all' | ProgressStatus | 'favorites';
export type LibrarySortMode = 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc' | 'duration_asc' | 'duration_desc' | 'rating_desc' | 'rating_asc';

export interface LibrarySelection {
  quickFilter: LibraryQuickFilter;
  text: string;
  sortMode: LibrarySortMode;
  playableOnly: boolean;
  shortOnly: boolean;
  ratedOnly: boolean;
}

export function selectLibraryGames(
  library: readonly LibraryGame[],
  selection: LibrarySelection,
  ownedPlatformIds: ReadonlySet<number>,
): LibraryGame[] {
  const normalized = selection.text.trim().toLocaleLowerCase('pt-BR');
  const matches = library.filter(item => {
    const status = item.progress?.status || 'not_started';
    if (selection.quickFilter === 'favorites' ? !item.favorite : selection.quickFilter !== 'all' && status !== selection.quickFilter) return false;
    if (normalized && !item.game.title.toLocaleLowerCase('pt-BR').includes(normalized)) return false;
    if (selection.playableOnly && item.game.platform_ids?.length && !item.game.platform_ids.some(id => ownedPlatformIds.has(id))) return false;
    if (selection.shortOnly && Number(item.game.duration_hours) > 12) return false;
    if (selection.ratedOnly && item.game.average_rating == null) return false;
    return true;
  });

  return [...matches].sort((a, b) => {
    if (selection.sortMode === 'title_asc') return a.game.title.localeCompare(b.game.title, 'pt-BR');
    if (selection.sortMode === 'title_desc') return b.game.title.localeCompare(a.game.title, 'pt-BR');
    if (selection.sortMode === 'duration_asc') return a.game.duration_hours - b.game.duration_hours;
    if (selection.sortMode === 'duration_desc') return b.game.duration_hours - a.game.duration_hours;
    if (selection.sortMode === 'rating_desc') return Number(b.game.average_rating ?? -Infinity) - Number(a.game.average_rating ?? -Infinity);
    if (selection.sortMode === 'rating_asc') return Number(a.game.average_rating ?? Infinity) - Number(b.game.average_rating ?? Infinity);
    if (selection.sortMode === 'updated_asc') return (a.updatedAt || '').localeCompare(b.updatedAt || '');
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
}
