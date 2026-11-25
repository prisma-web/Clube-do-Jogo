import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  androidProductUpdate,
  assembleProductUpdate,
  downloadProductUpdate,
  parseProductUpdate,
  parseReleaseNote,
  productUpdateStorageKey,
  productUpdateUrl,
  type ProductUpdate,
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
  assert.equal(productUpdateUrl(REPO, 'v1.2.0'), 'https://github.com/prisma-web/Clube-do-Jogo/releases/download/v1.2.0/product-update.json');
  assert.equal(productUpdateUrl(REPO, 'latest'), 'https://github.com/prisma-web/Clube-do-Jogo/releases/latest/download/product-update.json');
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
