import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  floatingTrailerSize,
  isTrailerInPlace,
  nextTrailerPlayback,
  parseTrailerPlayerMessage,
  shouldFloatTrailer,
  trailerRestoreScrollY,
  trailerVisibleFraction,
  type TrailerEvent,
  type TrailerPlayback,
} from '../../apps/mobile/src/features/media/floating-trailer';

function play(events: TrailerEvent[], start: TrailerPlayback = 'loading'): TrailerPlayback {
  return events.reduce(nextTrailerPlayback, start);
}

const youtube = (state: -1 | 0 | 1 | 2 | 3 | 5): TrailerEvent => ({ type: 'youtube', state });

test('the trailer counts as playing from the first YouTube "playing" state until it pauses, ends or is closed', () => {
  assert.equal(play([youtube(-1), youtube(3)]), 'loading');
  assert.equal(play([youtube(-1), youtube(3), youtube(1)]), 'playing');
  assert.equal(play([youtube(1), youtube(3)]), 'playing');
  assert.equal(play([youtube(1), youtube(2)]), 'paused');
  assert.equal(play([youtube(1), youtube(0)]), 'ended');
  assert.equal(play([youtube(1), { type: 'close' }]), 'closed');
  assert.equal(play([youtube(1), { type: 'close' }, youtube(1)]), 'playing');
});

test('the trailer floats only while it plays and its own spot is mostly off screen', () => {
  assert.equal(shouldFloatTrailer('playing', false), true);
  assert.equal(shouldFloatTrailer('playing', true), false);
  for (const playback of ['loading', 'paused', 'ended', 'closed'] as const) {
    assert.equal(shouldFloatTrailer(playback, false), false, playback);
  }
});

test('the trailer goes back to its spot once 85% of that spot is visible', () => {
  const anchorTop = 100;
  const anchorHeight = 200;
  const viewport = 600;
  assert.equal(trailerVisibleFraction(0, viewport, anchorTop, anchorHeight), 1);
  assert.equal(trailerVisibleFraction(130, viewport, anchorTop, anchorHeight), 0.85);
  assert.equal(isTrailerInPlace(130, viewport, anchorTop, anchorHeight), true);
  assert.equal(isTrailerInPlace(131, viewport, anchorTop, anchorHeight), false);
  assert.equal(trailerVisibleFraction(400, viewport, anchorTop, anchorHeight), 0);
  assert.equal(isTrailerInPlace(-470, viewport, anchorTop, anchorHeight), false);
});

test('a spot taller than the viewport still counts as in place when it fills the viewport', () => {
  assert.equal(trailerVisibleFraction(150, 180, 100, 300), 1);
  assert.equal(isTrailerInPlace(150, 180, 100, 300), true);
});

test('only well-formed state messages from the player page are accepted', () => {
  assert.equal(parseTrailerPlayerMessage('{"type":"youtube-state","state":1}'), 1);
  assert.equal(parseTrailerPlayerMessage('{"type":"youtube-state","state":-1}'), -1);
  for (const data of ['', 'null', '1', '{"type":"youtube-state","state":4}', '{"type":"youtube-state","state":"1"}', '{"type":"other","state":1}', '{oops']) {
    assert.equal(parseTrailerPlayerMessage(data), null, data);
  }
});

test('the floating window is a 16:9 corner window no wider than 320 pt', () => {
  assert.deepEqual(floatingTrailerSize(358), { width: 222, height: 125 });
  assert.deepEqual(floatingTrailerSize(900), { width: 320, height: 180 });
});

test('"Voltar ao trailer" centers the trailer spot in the viewport', () => {
  assert.equal(trailerRestoreScrollY(500, 200, 600), 300);
  assert.equal(trailerRestoreScrollY(100, 200, 600), 0);
  assert.equal(trailerRestoreScrollY(500, 700, 600), 500);
});
