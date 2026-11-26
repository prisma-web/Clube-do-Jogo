import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  androidProductUpdate,
  assembleProductUpdate,
  compareReleaseTags,
  downloadProductUpdate,
  downloadProductUpdateHistory,
  githubReleasesUrl,
  moreProductUpdatesLabel,
  parseProductUpdate,
  parseProductUpdateHistory,
  parseReleaseNote,
  productUpdateDigest,
  productUpdateHistoryTags,
  productUpdatePages,
  productUpdateSeenTag,
  productUpdateSteps,
  productUpdateStorageKey,
  productUpdateTitle,
  releaseAssetUrl,
  type ProductUpdate,
  type ProductUpdateHistory,
} from './product-updates';

const REPO = 'prisma-web/Clube-do-Jogo';

function note(overrides: Record<string, unknown> = {}) {
  return {
    eyebrow: 'RANKING',
    title: 'O ranking entrou na fila de balanceamento',
    body: 'A votação ficou mais direta: escolha entre Jogaria e Não.',
    highlights: ['Mesma pontuação, mesma posição.'],
    image: { file: 'ranking-votes.webp', alt: 'Página do ranking.', width: 860, height: 500 },
    ...overrides,
  };
}

function errorsOf(json: unknown, slug = 'ranking-votes') {
  const parsed = parseReleaseNote(json, slug);
  assert.equal(parsed.ok, false, 'note should be invalid');
  return parsed.ok ? [] : parsed.errors;
}

const update: ProductUpdate = {
  id: 'v1.2.0',
  version: 'v1.2.0',
  title: 'Novidades da v1.2.0',
  steps: [
    {
      eyebrow: 'RANKING',
      title: 'Empates dividem a posição',
      body: 'Jogos com a mesma pontuação ficam lado a lado.',
      image: { src: `https://raw.githubusercontent.com/${REPO}/v1.2.0/updates/notes/ranking.webp`, alt: 'Ranking.', width: 860, height: 500, position: 'top' },
    },
    {
      eyebrow: 'CONFIGURAÇÕES',
      title: 'Seu app, suas regras',
      body: 'Toque no avatar do cabeçalho.',
      highlights: ['Tema e escala de notas.'],
      artwork: 'overview',
      android: { body: 'Toque na engrenagem no Perfil.' },
    },
  ],
};

test('productUpdateStorageKey scopes the key by update id', () => {
  assert.equal(productUpdateStorageKey('v1.2.0'), 'clube-do-jogo:product-update:v1.2.0:completed');
});

test('a seen key gives back its release tag, and other keys give nothing', () => {
  assert.equal(productUpdateSeenTag(productUpdateStorageKey('v1.10.0')), 'v1.10.0');
  for (const key of [productUpdateStorageKey('v1.1'), productUpdateStorageKey('v01.2.0'), `${productUpdateStorageKey('v1.2.0')}/account/x`, 'clube-do-jogo:theme']) {
    assert.equal(productUpdateSeenTag(key), null, key);
  }
});

test('a complete release note parses into its typed value', () => {
  const json = note({ android: { body: 'No app, toque na engrenagem.', highlights: ['Só no Android.'] } });
  assert.deepEqual(parseReleaseNote(json, 'ranking-votes'), { ok: true, value: json });
});

test('a note with only eyebrow, title and body is valid', () => {
  const minimal = { eyebrow: 'PERFIL', title: 'Seu perfil', body: 'Mostre seus favoritos.' };
  assert.deepEqual(parseReleaseNote(minimal, 'perfil'), { ok: true, value: minimal });
});

test('an artwork note without image is valid', () => {
  const parsed = parseReleaseNote(note({ image: undefined, artwork: 'performance' }), 'performance');
  assert.equal(parsed.ok, true);
});

test('rejects a note that is not an object', () => {
  assert.ok(errorsOf([]).length > 0);
  assert.ok(errorsOf('texto').length > 0);
});

test('rejects unknown keys at every level', () => {
  assert.ok(errorsOf(note({ subtitle: 'x' })).some(error => error.includes('subtitle')));
  assert.ok(errorsOf(note({ image: { ...note().image, caption: 'x' } })).some(error => error.includes('caption')));
  assert.ok(errorsOf(note({ android: { title: 'x' } })).some(error => error.includes('title')));
});

test('rejects missing and empty text fields', () => {
  for (const key of ['eyebrow', 'title', 'body']) {
    assert.ok(errorsOf(note({ [key]: undefined })).some(error => error.includes(key)), `missing ${key}`);
    assert.ok(errorsOf(note({ [key]: '   ' })).some(error => error.includes(key)), `blank ${key}`);
  }
  assert.ok(errorsOf(note({ image: { ...note().image, alt: '' } })).some(error => error.includes('alt')));
});

test('rejects an eyebrow that is not uppercase', () => {
  assert.ok(errorsOf(note({ eyebrow: 'Ranking' })).some(error => error.includes('eyebrow')));
  assert.equal(parseReleaseNote(note({ eyebrow: 'PROGRESSO E ANOTAÇÕES' }), 'ranking-votes').ok, true);
});

test('rejects empty or blank highlights', () => {
  assert.ok(errorsOf(note({ highlights: [] })).some(error => error.includes('highlights')));
  assert.ok(errorsOf(note({ highlights: ['ok', ''] })).some(error => error.includes('highlights')));
  assert.ok(errorsOf(note({ android: { highlights: [] } })).some(error => error.includes('highlights')));
});

test('the image file must be the note slug with .webp', () => {
  assert.ok(errorsOf(note({ image: { ...note().image, file: 'other.webp' } })).some(error => error.includes('ranking-votes.webp')));
  assert.ok(errorsOf(note({ image: { ...note().image, file: 'ranking-votes.png' } })).length > 0);
});

test('image width and height must be positive integers', () => {
  for (const width of [0, -1, 1.5, '860', undefined]) {
    assert.ok(errorsOf(note({ image: { ...note().image, width } })).some(error => error.includes('width')), `width ${width}`);
  }
  assert.ok(errorsOf(note({ image: { ...note().image, height: 0 } })).some(error => error.includes('height')));
});

test('image position and artwork only accept their known values', () => {
  assert.ok(errorsOf(note({ image: { ...note().image, position: 'left' } })).some(error => error.includes('position')));
  assert.ok(errorsOf(note({ image: undefined, artwork: 'hero' })).some(error => error.includes('artwork')));
});

test('a note cannot carry both an image and an artwork', () => {
  assert.ok(errorsOf(note({ artwork: 'overview' })).length > 0);
});

test('an android override needs a body or highlights', () => {
  assert.ok(errorsOf(note({ android: {} })).some(error => error.includes('android')));
});

test('the slug must be kebab-case', () => {
  assert.ok(errorsOf(note({ image: undefined }), 'Ranking_Votes').length > 0);
});

test('assembles notes into the release payload with immutable image URLs at the tag', () => {
  const ranking = parseReleaseNote(note({ image: { ...note().image, position: 'top' } }), 'ranking-votes');
  const settings = parseReleaseNote({ eyebrow: 'CONFIGURAÇÕES', title: 'Seu app', body: 'Toque no avatar.', artwork: 'overview' }, 'settings');
  assert.ok(ranking.ok && settings.ok);
  assert.deepEqual(assembleProductUpdate('v1.2.0', [ranking.value, settings.value], REPO), {
    id: 'v1.2.0',
    version: 'v1.2.0',
    title: 'Novidades da v1.2.0',
    steps: [
      {
        ...ranking.value,
        image: {
          src: 'https://raw.githubusercontent.com/prisma-web/Clube-do-Jogo/v1.2.0/updates/notes/ranking-votes.webp',
          alt: 'Página do ranking.',
          width: 860,
          height: 500,
          position: 'top',
        },
      },
      settings.value,
    ],
  });
});

test('an assembled payload parses back into the same update', () => {
  assert.deepEqual(parseProductUpdate(JSON.parse(JSON.stringify(update))), { ok: true, value: update });
});

test('rejects payloads with a bad id, no steps or an image without an https src', () => {
  assert.equal(parseProductUpdate({ ...update, id: 'v1.2' }).ok, false);
  assert.equal(parseProductUpdate({ ...update, steps: [] }).ok, false);
  assert.equal(parseProductUpdate({ ...update, extra: true }).ok, false);
  const httpImage = { ...update.steps[0], image: { ...update.steps[0].image, src: 'http://example.com/a.webp' } };
  assert.equal(parseProductUpdate({ ...update, steps: [httpImage] }).ok, false);
  const fileImage = { ...update.steps[0], image: { file: 'ranking.webp', alt: 'x', width: 1, height: 1 } };
  assert.equal(parseProductUpdate({ ...update, steps: [fileImage] }).ok, false);
});

test('the android update swaps in the android copy and keeps the rest', () => {
  const android = androidProductUpdate(update);
  assert.equal(android.steps[0].body, update.steps[0].body);
  assert.equal(android.steps[1].body, 'Toque na engrenagem no Perfil.');
  assert.deepEqual(android.steps[1].highlights, ['Tema e escala de notas.']);
  assert.equal(android.steps[1].artwork, 'overview');
});

test('notes live in the release download URL, which has no API rate limit', () => {
  const releases = githubReleasesUrl(REPO);
  assert.equal(releaseAssetUrl(releases, 'v1.2.0', 'product-updates.json'), 'https://github.com/prisma-web/Clube-do-Jogo/releases/download/v1.2.0/product-updates.json');
  assert.equal(releaseAssetUrl(releases, 'latest', 'product-update.json'), 'https://github.com/prisma-web/Clube-do-Jogo/releases/latest/download/product-update.json');
});

test('release tags compare as versions, not as text', () => {
  assert.deepEqual(['v1.10.0', 'v1.2.0', 'v1.9.3', 'v2.0.0', 'v1.9.10'].sort(compareReleaseTags), ['v1.2.0', 'v1.9.3', 'v1.9.10', 'v1.10.0', 'v2.0.0']);
});

function release(tag: string, notes = 1): ProductUpdate {
  return {
    id: tag,
    version: tag,
    title: `Novidades da ${tag}`,
    steps: Array.from({ length: notes }, (_, index) => ({ eyebrow: 'RANKING', title: `${tag} nota ${index + 1}`, body: 'Texto.' })),
  };
}

const realHistory: ProductUpdateHistory = {
  id: 'v1.3.6',
  releases: [
    release('v1.3.6'), release('v1.3.5'), release('v1.3.4'), release('v1.3.3'), release('v1.3.2'),
    release('v1.3.1', 2), release('v1.3.0', 4), release('v1.2.0', 5),
  ],
};
const ids = (releases: readonly ProductUpdate[]) => releases.map(item => item.id);

test('the history parses newest first, drops invalid or later releases and repeated versions', () => {
  const json = { id: 'v1.3.0', releases: [release('v1.2.0'), release('v1.10.0'), { ...release('v1.2.1'), steps: [] }, release('v1.3.0'), release('v1.2.0', 2)] };
  const parsed = parseProductUpdateHistory(JSON.parse(JSON.stringify(json)));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok && ids(parsed.value.releases), ['v1.3.0', 'v1.2.0']);
});

test('a history without a tag id or without any valid release is invalid', () => {
  assert.equal(parseProductUpdateHistory({ releases: [release('v1.2.0')] }).ok, false);
  assert.equal(parseProductUpdateHistory({ id: 'v1.2.0', releases: [] }).ok, false);
  assert.equal(parseProductUpdateHistory({ id: 'v1.2.0', releases: [release('v1.3.0')] }).ok, false);
  assert.equal(parseProductUpdateHistory(release('v1.2.0')).ok, false);
});

test('the history file is not a product-update.json, so older apps never mistake one for the other', () => {
  assert.equal(parseProductUpdate(realHistory).ok, false);
});

test('the tags whose seen flag tells where the member stopped are the history tags', () => {
  assert.deepEqual(productUpdateHistoryTags({ id: 'v1.3.7', releases: [release('v1.3.6'), release('v1.3.5')] }), ['v1.3.7', 'v1.3.6', 'v1.3.5']);
});

const pageIds = (pages: readonly ProductUpdate[][]) => pages.map(ids);

test('coming from v1.2.0, the member sees every later version, newest first, ten notes of whole versions per page', () => {
  const digest = productUpdateDigest(realHistory, { seen: ['v1.2.0'] });
  assert.equal(digest.pending, true);
  assert.deepEqual(pageIds(digest.pages), [['v1.3.6', 'v1.3.5', 'v1.3.4', 'v1.3.3', 'v1.3.2', 'v1.3.1'], ['v1.3.0']]);
  assert.equal(productUpdateTitle(digest.pages[0]), 'Novidades da v1.3.1 à v1.3.6');
  assert.equal(moreProductUpdatesLabel(digest.pages.slice(1)), 'Mais 4 novidades da v1.3.0');
  assert.deepEqual(productUpdateSteps(digest.pages[0]).map(step => step.version), ['v1.3.6', 'v1.3.5', 'v1.3.4', 'v1.3.3', 'v1.3.2', 'v1.3.1', 'v1.3.1']);
});

test('the newest seen version wins, whatever order the flags come in', () => {
  assert.deepEqual(pageIds(productUpdateDigest(realHistory, { seen: ['v1.3.4', 'v1.2.0', 'v1.1', 'v1.3.10-rc'] }).pages), [['v1.3.6', 'v1.3.5']]);
});

test('a fresh install, with no seen flag and no cached release, sees only the current version', () => {
  const digest = productUpdateDigest(realHistory, { seen: [] });
  assert.equal(digest.pending, true);
  assert.deepEqual(pageIds(digest.pages), [['v1.3.6']]);
  assert.equal(productUpdateTitle(digest.pages[0]), 'Novidades da v1.3.6');
});

test('a member who had a version installed but never closed its notes sees that version too', () => {
  assert.deepEqual(pageIds(productUpdateDigest(realHistory, { seen: [], installedBefore: 'v1.3.4' }).pages), [['v1.3.6', 'v1.3.5', 'v1.3.4']]);
  assert.deepEqual(pageIds(productUpdateDigest(realHistory, { seen: ['v1.3.5'], installedBefore: 'v1.3.4' }).pages), [['v1.3.6']]);
  assert.deepEqual(pageIds(productUpdateDigest(realHistory, { seen: [], installedBefore: 'v1.3.6' }).pages), [['v1.3.6']]);
});

test('a member who saw everything has nothing pending, and settings replays the newest version, then the older ones', () => {
  for (const seen of [['v1.3.6'], ['v1.4.0']]) {
    const digest = productUpdateDigest(realHistory, { seen });
    assert.equal(digest.pending, false);
    assert.deepEqual(pageIds(digest.pages), [['v1.3.6'], ['v1.3.5', 'v1.3.4', 'v1.3.3', 'v1.3.2', 'v1.3.1', 'v1.3.0'], ['v1.2.0']]);
  }
});

test('an installed version without notes still brings the notes the member skipped, and nothing on a fresh install', () => {
  const history = { id: 'v1.3.7', releases: realHistory.releases };
  assert.deepEqual(pageIds(productUpdateDigest(history, { seen: ['v1.3.4'] }).pages), [['v1.3.6', 'v1.3.5']]);
  assert.equal(productUpdateDigest(history, { seen: [] }).pending, false);
  assert.equal(productUpdateDigest(history, { seen: ['v1.3.7'] }).pending, false);
});

test('pages hold whole versions, in order, and a version larger than the limit gets a page of its own', () => {
  const releases = [release('v1.4.0', 3), release('v1.3.0', 12), release('v1.2.0', 8), release('v1.1.0', 2), release('v1.0.0', 1)];
  assert.deepEqual(pageIds(productUpdatePages(releases)), [['v1.4.0'], ['v1.3.0'], ['v1.2.0', 'v1.1.0'], ['v1.0.0']]);
  assert.deepEqual(productUpdatePages([]), []);
});

test('the label of the remaining pages counts their notes and versions', () => {
  const pages = productUpdatePages([release('v1.2.0', 8), release('v1.1.0', 1), release('v1.0.0', 5)]);
  assert.equal(moreProductUpdatesLabel(pages), 'Mais 14 novidades de 3 versões anteriores (v1.0.0 à v1.2.0)');
  assert.equal(moreProductUpdatesLabel([[release('v1.0.0')]]), 'Mais 1 novidade da v1.0.0');
  assert.equal(moreProductUpdatesLabel([]), null);
});

function respond(body: unknown, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token <');
      return body;
    },
  });
}

const URL_V12 = 'https://github.com/prisma-web/Clube-do-Jogo/releases/download/v1.2.0/product-update.json';

test('downloads valid notes', async () => {
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', respond(update)), { status: 'found', update });
  assert.deepEqual(await downloadProductUpdate(URL_V12, null, respond(update)), { status: 'found', update });
});

test('a release without notes, invalid notes or notes of another release are missing', async () => {
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', respond('Not Found', 404)), { status: 'missing' });
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', respond({ ...update, steps: 'nope' })), { status: 'missing' });
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', respond({ ...update, id: 'v1.1.0' })), { status: 'missing' });
});

test('network errors, server errors and non-JSON bodies are failures worth retrying', async () => {
  const offline = async () => {
    throw new TypeError('fetch failed');
  };
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', offline), { status: 'failed' });
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', respond('Bad Gateway', 502)), { status: 'failed' });
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', respond({ message: 'Server Error' }, 500)), { status: 'failed' });
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', respond('<html>captive portal</html>')), { status: 'failed' });
});

test('downloads a history of the expected release and treats a single release file as missing', async () => {
  const URL_HISTORY = 'https://github.com/prisma-web/Clube-do-Jogo/releases/download/v1.3.6/product-updates.json';
  assert.deepEqual(await downloadProductUpdateHistory(URL_HISTORY, 'v1.3.6', respond(realHistory)), { status: 'found', update: realHistory });
  assert.deepEqual(await downloadProductUpdateHistory(URL_HISTORY, 'v1.3.7', respond(realHistory)), { status: 'missing' });
  assert.deepEqual(await downloadProductUpdateHistory(URL_HISTORY, null, respond(update)), { status: 'missing' });
  assert.deepEqual(await downloadProductUpdateHistory(URL_HISTORY, null, respond('Bad Gateway', 502)), { status: 'failed' });
});

test('gives up on a server that never answers after 3 seconds', { timeout: 4000 }, async () => {
  const socket = setTimeout(() => {}, 5000);
  const hanging = (_url: string, { signal }: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      clearTimeout(socket);
      reject(signal.reason);
    });
  });
  const started = performance.now();
  assert.deepEqual(await downloadProductUpdate(URL_V12, 'v1.2.0', hanging), { status: 'failed' });
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= 2950 && elapsed < 3500, `gave up after ${elapsed} ms`);
});
