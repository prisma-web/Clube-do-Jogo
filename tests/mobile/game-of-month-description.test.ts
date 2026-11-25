import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mock, test } from 'node:test';
import type { ReactNode } from 'react';
import { demoGames, type Game } from '@clube-do-jogo/domain';

const appRequire = createRequire(path.join(process.cwd(), 'apps/mobile/package.json'));
const { createElement } = appRequire('react') as typeof import('react');
const { renderToStaticMarkup } = appRequire('react-dom/server') as typeof import('react-dom/server');

const state: { game: Game | null } = { game: null };

const passthrough = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
const none = () => null;
const query = () => ({ data: [], isLoading: false, error: null, refetch: async () => undefined });
const mutation = () => ({ mutate() {}, isPending: false, isError: false, error: null });

mock.module('react-native', { exports: { Pressable: passthrough, Text: passthrough, View: passthrough } });
mock.module('expo-image', { exports: { Image: none } });
mock.module('@expo/vector-icons', { exports: { Ionicons: none } });
mock.module('expo-router', {
  exports: { useRouter: () => ({ push() {}, setParams() {} }), useLocalSearchParams: () => ({ section: 'timeline' }) },
});
mock.module('@/theme', { exports: { themedStyles: () => () => ({}), useThemeColors: () => ({}), radii: {}, spacing: {}, typography: {} } });
mock.module('@/lib/format', { exports: { formatMonth: (month: string) => month } });
mock.module('@/components/Screen', { exports: { Screen: passthrough } });
mock.module('@/components/AppHeader', { exports: { AppHeader: none } });
mock.module('@/components/Chip', { exports: { Chip: none } });
mock.module('@/components/MonthTrigger', { exports: { MonthTrigger: none } });
mock.module('@/components/MonthPicker', { exports: { MonthPicker: none } });
mock.module('@/components/StatusPill', { exports: { StatusPill: none, useStatusMeta: () => ({}) } });
mock.module('@/components/RatingSheet', { exports: { RatingSheet: none } });
mock.module('@/components/RatingValue', { exports: { RatingValue: none } });
mock.module('@/components/ProgressConfirmSheet', { exports: { ProgressConfirmSheet: none } });
mock.module('@/components/StateViews', { exports: { EmptyState: none, ErrorState: none, LoadingState: none } });
mock.module('@/features/progress/ClubProgressCard', { exports: { ClubProgressCard: none } });
mock.module('@/features/timeline/Timeline', { exports: { Timeline: none } });
mock.module('@/features/notes/PrivateNotes', { exports: { PrivateNotes: none } });
mock.module('@/state/app-provider', {
  exports: {
    useApp: () => ({ userId: 'u', selectedMonth: '2026-11', activeMonth: '2026-11', months: [], isHistorical: false, setSelectedMonth() {} }),
  },
});
mock.module('@/state/queries', {
  exports: {
    useGameOfMonth: () => ({ data: state.game, isLoading: false, isError: false, isRefetching: false, refetch: async () => undefined }),
    useProgress: query,
    useSetProgress: mutation,
  },
});
mock.module('@/state/library-queries', { exports: { useSetRating: mutation } });

const screenModule = import('../../apps/mobile/app/(app)/(tabs)/jogo-do-mes');

async function renderWith(description: string | null) {
  state.game = { ...demoGames[0], description };
  const { default: GameOfMonthScreen } = await screenModule;
  return renderToStaticMarkup(createElement(GameOfMonthScreen));
}

test('the game of the month screen renders when the game has no description', async () => {
  const html = await renderWith(null);
  assert.match(html, /Hades/);
  assert.match(html, /Sem descrição disponível\./);
  assert.doesNotMatch(html, /Ver mais/);
});

test('a long description still offers "Ver mais"', async () => {
  const html = await renderWith('Um roguelike. '.repeat(20));
  assert.match(html, /Um roguelike\./);
  assert.match(html, /Ver mais/);
});
