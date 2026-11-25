import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoGames, type Game } from '@clube-do-jogo/domain';

const state: { game: Game | null } = { game: null };

const passthrough = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
const icon = () => null;
mock.module('next/link', { exports: { default: ({ children, href }: { children?: ReactNode; href: string }) => createElement('a', { href }, children) } });
mock.module('@radix-ui/react-tabs', { exports: { Root: passthrough, List: passthrough, Trigger: passthrough, Content: passthrough } });
mock.module('lucide-react', { exports: { CalendarClock: icon, Crown: icon, ListChecks: icon, MessageCircle: icon, NotebookPen: icon } });
mock.module('@/lib/supabase/client', { exports: { createClient: () => ({}) } });
mock.module('@/lib/data', { exports: { fetchGameOfMonth: async () => state.game } });
mock.module('@/hooks/use-stale-query', { exports: { useStaleQuery: () => ({ data: state.game, isInitialLoading: false }) } });
mock.module('@/hooks/use-url-state', { exports: { useUrlTab: () => ['timeline', () => undefined] } });
mock.module('@/components/app-provider', {
  exports: { useApp: () => ({ selectedMonth: '2026-11', isHistorical: false, isDemo: true, clubRevision: 0, cycles: [] }) },
});
mock.module('@/components/timeline', { exports: { Timeline: () => null } });
mock.module('@/components/progress-list', { exports: { ProgressList: () => null } });
mock.module('@/components/notes-chat', { exports: { NotesChat: () => null } });
mock.module('@/components/ui/skeleton', { exports: { Skeleton: () => null } });

const pageModule = import('../../src/app/jogo-do-mes/page');

async function renderWith(description: string | null) {
  state.game = { ...demoGames[0], description };
  const { default: GameOfMonthPage } = await pageModule;
  return renderToStaticMarkup(createElement(GameOfMonthPage));
}

test('the game of the month page renders when the game has no description', async () => {
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
