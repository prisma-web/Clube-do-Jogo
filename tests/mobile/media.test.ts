import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { youtubeEmbedUrl, isAllowedYoutubeOrigin, isAllowedPlayerNavigation, youtubeEmbedderOrigin, youtubePlayerSource } from '../../apps/mobile/src/features/media/youtube';

test('trailers accept YouTube links and never carry input credentials or query parameters', () => {
  for (const url of ['https://youtu.be/dQw4w9WgXcQ?token=private', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ']) {
    assert.equal(youtubeEmbedUrl(url), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0&modestbranding=1&controls=1');
  }
  for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'https://example.test/video', 'https://youtu.be/%22%3E']) {
    assert.equal(youtubeEmbedUrl(url), null);
  }
  for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'https://example.test/video', 'https://user:password@www.youtube.com', 'https://www.youtube.com:444']) {
    assert.equal(isAllowedYoutubeOrigin(url), false);
  }
  assert.equal(isAllowedYoutubeOrigin('http://www.youtube.com/embed/dQw4w9WgXcQ'), false);
  assert.equal(isAllowedYoutubeOrigin('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), true);
});

test('native sharing uses the configured HTTPS site and encodes each route identifier', () => {
  const script = `import { getCanonicalGameUrl, getCanonicalProfileUrl } from './apps/mobile/src/features/media/canonical-url.ts'; console.log(JSON.stringify([getCanonicalGameUrl('game/id'), getCanonicalProfileUrl('profile?id')]));`;
  const cases: Array<[string, Array<string | null>]> = [
    ['https://club.example.test/', ['https://club.example.test/jogos/game%2Fid', 'https://club.example.test/perfil/profile%3Fid']],
    ['http://127.0.0.1:3101', [null, null]],
    ['https://user:password@club.example.test', [null, null]],
    ['javascript:alert(1)', [null, null]],
    ['', [null, null]],
  ];
  for (const [site, expected] of cases) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: process.cwd(), env: { ...process.env, EXPO_PUBLIC_SITE_URL: site }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected);
  }
});

test('trailers identify the embedder to YouTube so the player does not fail with Error 153', () => {
  assert.equal(youtubeEmbedderOrigin('https://clube.example/jogos?x=1', 'com.clubedojogo.mobile'), 'https://clube.example');
  assert.equal(youtubeEmbedderOrigin(null, 'com.clubedojogo.mobile.dev'), 'https://com.clubedojogo.mobile.dev');
  assert.equal(youtubeEmbedderOrigin('http://clube.example', 'com.clubedojogo.mobile'), 'https://com.clubedojogo.mobile');
  assert.equal(youtubeEmbedderOrigin(null, 'not an id"><script>'), 'https://clubedojogo.app');

  const embed = youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')!;
  const source = youtubePlayerSource(embed, 'https://clube.example', { autoplay: true })!;
  assert.equal(source.baseUrl, 'https://clube.example/');
  assert.match(source.html, /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?[^"]*autoplay=1/);
  assert.match(source.html, /origin=https%3A%2F%2Fclube\.example/);
  assert.match(source.html, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.ok(!youtubePlayerSource(embed, 'https://clube.example')!.html.includes('autoplay=1'));
  assert.equal(youtubePlayerSource('https://example.test/embed/x', 'https://clube.example'), null);

  assert.equal(isAllowedPlayerNavigation('https://clube.example/', 'https://clube.example'), true);
  assert.equal(isAllowedPlayerNavigation('about:blank', 'https://clube.example'), true);
  assert.equal(isAllowedPlayerNavigation(embed, 'https://clube.example'), true);
  assert.equal(isAllowedPlayerNavigation('https://clube.example/jogos', 'https://clube.example'), false);
  assert.equal(isAllowedPlayerNavigation('https://evil.test/', 'https://clube.example'), false);
});
