import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCommentsClient, type CommentRealtimeEvent } from '@clube-do-jogo/data';

type Binding = { event: string; table: string; filter?: string; handler: (payload: unknown) => void };

class RealtimeChannelWithoutFilteredDeletes {
  readonly bindings: Binding[] = [];

  on(_type: string, config: { event: string; table: string; filter?: string }, handler: (payload: unknown) => void) {
    this.bindings.push({ ...config, handler });
    return this;
  }

  subscribe() {
    return this;
  }

  change(table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', row: Record<string, unknown>) {
    for (const binding of this.bindings) {
      if (binding.table !== table || (binding.event !== '*' && binding.event !== eventType)) continue;
      if (binding.filter && eventType === 'DELETE') continue;
      if (binding.filter) {
        const [column, value] = binding.filter.split('=eq.');
        if (row[column] !== value) continue;
      }
      binding.handler({ eventType, new: eventType === 'DELETE' ? {} : row, old: eventType === 'DELETE' ? { id: row.id } : {} });
    }
  }
}

function subscribe() {
  const channel = new RealtimeChannelWithoutFilteredDeletes();
  const supabase = { channel: () => channel, removeChannel: async () => 'ok' } as unknown as SupabaseClient;
  const events: CommentRealtimeEvent[] = [];
  const unsubscribe = createCommentsClient({ supabase }).subscribe({
    userId: 'user-ana',
    isDemo: false,
    gameId: 'game-1',
    clubMonth: '2026-11',
    onEvent: event => events.push(event),
  });
  return { channel, events, unsubscribe };
}

const comment = { id: 'comment-1', user_id: 'user-bruno', game_id: 'game-1', club_month: '2026-11', parent_id: null, body: 'oi', created_at: '2026-11-25T10:00:00Z', updated_at: '2026-11-25T10:00:00Z' };
const reaction = { id: 'reaction-1', comment_id: 'comment-1', user_id: 'user-bruno', game_id: 'game-1', club_month: '2026-11', emoji: '🔥', created_at: '2026-11-25T10:01:00Z' };

test('a comment deleted by someone else reaches the subscriber', () => {
  const { channel, events } = subscribe();
  channel.change('club_comments', 'INSERT', comment);
  channel.change('club_comments', 'DELETE', comment);
  assert.deepEqual(events.map(event => `${event.table}:${event.eventType}`), ['club_comments:INSERT', 'club_comments:DELETE']);
});

test('a reaction removed by someone else reaches the subscriber', () => {
  const { channel, events } = subscribe();
  channel.change('comment_reactions', 'INSERT', reaction);
  channel.change('comment_reactions', 'DELETE', reaction);
  assert.deepEqual(events.map(event => `${event.table}:${event.eventType}`), ['comment_reactions:INSERT', 'comment_reactions:DELETE']);
});

test('inserts from another game stay out', () => {
  const { channel, events } = subscribe();
  channel.change('club_comments', 'INSERT', { ...comment, id: 'comment-2', game_id: 'game-2' });
  channel.change('comment_reactions', 'INSERT', { ...reaction, id: 'reaction-2', game_id: 'game-2' });
  assert.deepEqual(events, []);
});
