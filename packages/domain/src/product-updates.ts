// scripts/release-notes.mjs loads this file with Node's type stripping, so it keeps no relative imports.

export type ProductUpdateImagePosition = 'top' | 'center' | 'bottom';
export type ProductUpdateArtwork = 'overview' | 'performance';

export interface ProductUpdateImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  position?: ProductUpdateImagePosition;
}

export interface ReleaseNoteImage {
  file: string;
  alt: string;
  width: number;
  height: number;
  position?: ProductUpdateImagePosition;
}

export interface AndroidCopy {
  body?: string;
  highlights?: string[];
}

interface StepCopy<Image> {
  eyebrow: string;
  title: string;
  body: string;
  highlights?: string[];
  image?: Image;
  artwork?: ProductUpdateArtwork;
  android?: AndroidCopy;
}

/** One `updates/notes/<slug>.json`. */
export type ReleaseNote = StepCopy<ReleaseNoteImage>;
export type ProductUpdateStep = StepCopy<ProductUpdateImage>;

/** The `product-update.json` asset of a `vX.Y.Z` GitHub release. */
export interface ProductUpdate {
  id: string;
  version: string;
  title: string;
  steps: ProductUpdateStep[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const RELEASES_REPO = 'prisma-web/Clube-do-Jogo';
export const PRODUCT_UPDATE_ASSET = 'product-update.json';
export const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const NOTE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const POSITIONS: readonly string[] = ['top', 'center', 'bottom'];
const ARTWORKS: readonly string[] = ['overview', 'performance'];

export function productUpdateStorageKey(updateId: string) {
  return `clube-do-jogo:product-update:${updateId}:completed`;
}

type Fields = Record<string, unknown>;

class Reader {
  readonly errors: string[] = [];

  object(value: unknown, path: string, keys: readonly string[]): Fields | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.errors.push(`${path} precisa ser um objeto JSON.`);
      return null;
    }
    for (const key of Object.keys(value)) {
      if (!keys.includes(key)) this.errors.push(`${path} tem a chave desconhecida "${key}". Use só: ${keys.join(', ')}.`);
    }
    return value as Fields;
  }

  text(fields: Fields, key: string, path: string): string {
    const value = fields[key];
    if (typeof value !== 'string' || value.trim() === '') this.errors.push(`"${path}${key}" precisa ser um texto não vazio.`);
    return value as string;
  }

  texts(fields: Fields, key: string, path: string): string[] | undefined {
    const value = fields[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.trim() === '')) {
      this.errors.push(`"${path}${key}" precisa ser uma lista com pelo menos um texto, sem textos vazios.`);
    }
    return value as string[];
  }

  dimension(fields: Fields, key: string, path: string): number {
    const value = fields[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      this.errors.push(`"${path}${key}" precisa ser um inteiro positivo, em pixels.`);
    }
    return value as number;
  }

  choice<T extends string>(fields: Fields, key: string, path: string, choices: readonly string[]): T | undefined {
    const value = fields[key];
    if (value !== undefined && (typeof value !== 'string' || !choices.includes(value))) {
      this.errors.push(`"${path}${key}" precisa ser um destes: ${choices.join(', ')}.`);
    }
    return value as T | undefined;
  }

  result<T>(value: T): Parsed<T> {
    return this.errors.length ? { ok: false, errors: this.errors } : { ok: true, value };
  }
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function readStep<Image>(reader: Reader, value: unknown, path: string, readImage: (value: unknown) => Image): StepCopy<Image> | null {
  const fields = reader.object(value, path, ['eyebrow', 'title', 'body', 'highlights', 'image', 'artwork', 'android']);
  if (!fields) return null;
  const prefix = path.startsWith('steps') ? `${path}.` : '';
  const eyebrow = reader.text(fields, 'eyebrow', prefix);
  if (typeof eyebrow === 'string' && eyebrow !== eyebrow.toLocaleUpperCase('pt-BR')) {
    reader.errors.push(`"${prefix}eyebrow" precisa estar em MAIÚSCULAS: "${eyebrow.toLocaleUpperCase('pt-BR')}".`);
  }
  const step = {
    eyebrow,
    title: reader.text(fields, 'title', prefix),
    body: reader.text(fields, 'body', prefix),
    highlights: reader.texts(fields, 'highlights', prefix),
    image: fields.image === undefined ? undefined : readImage(fields.image),
    artwork: reader.choice<ProductUpdateArtwork>(fields, 'artwork', prefix, ARTWORKS),
    android: fields.android === undefined ? undefined : readAndroid(reader, fields.android, `${prefix}android`),
  };
  if (step.image !== undefined && step.artwork !== undefined) {
    reader.errors.push(`${path} tem "image" e "artwork". Use um ou outro.`);
  }
  return withoutUndefined(step);
}

function readAndroid(reader: Reader, value: unknown, path: string): AndroidCopy | undefined {
  const fields = reader.object(value, `"${path}"`, ['body', 'highlights']);
  if (!fields) return undefined;
  if (fields.body === undefined && fields.highlights === undefined) {
    reader.errors.push(`"${path}" precisa de "body" ou "highlights". Sem diferença no Android, apague "android".`);
  }
  return withoutUndefined({
    body: fields.body === undefined ? undefined : reader.text(fields, 'body', `${path}.`),
    highlights: reader.texts(fields, 'highlights', `${path}.`),
  });
}

function readImageSize(reader: Reader, fields: Fields, path: string) {
  return {
    alt: reader.text(fields, 'alt', path),
    width: reader.dimension(fields, 'width', path),
    height: reader.dimension(fields, 'height', path),
    position: reader.choice<ProductUpdateImagePosition>(fields, 'position', path, POSITIONS),
  };
}

/** Validates one `updates/notes/<slug>.json`. Errors are pt-BR sentences for the PR author. */
export function parseReleaseNote(json: unknown, slug: string): Parsed<ReleaseNote> {
  const reader = new Reader();
  if (!NOTE_SLUG.test(slug)) {
    reader.errors.push(`O nome "${slug}" precisa ser kebab-case (a-z, 0-9 e hífens), como "ranking-empates".`);
  }
  const note = readStep<ReleaseNoteImage>(reader, json, 'A nota', value => {
    const fields = reader.object(value, '"image"', ['file', 'alt', 'width', 'height', 'position']);
    if (!fields) return value as ReleaseNoteImage;
    const file = `${slug}.webp`;
    if (fields.file !== file) reader.errors.push(`"image.file" precisa ser "${file}", o nome da nota com .webp.`);
    return withoutUndefined({ file: fields.file as string, ...readImageSize(reader, fields, 'image.') });
  });
  return reader.result(note as ReleaseNote);
}

/** Validates a downloaded `product-update.json`. */
export function parseProductUpdate(json: unknown): Parsed<ProductUpdate> {
  const reader = new Reader();
  const fields = reader.object(json, 'A novidade', ['id', 'version', 'title', 'steps']);
  if (!fields) return reader.result(json as ProductUpdate);
  if (typeof fields.id !== 'string' || !RELEASE_TAG.test(fields.id)) reader.errors.push('"id" precisa ser uma tag vX.Y.Z.');
  const version = reader.text(fields, 'version', '');
  const title = reader.text(fields, 'title', '');
  const steps = Array.isArray(fields.steps) ? fields.steps : [];
  if (steps.length === 0) reader.errors.push('"steps" precisa ser uma lista com pelo menos um passo.');
  const parsedSteps = steps.map((step, index) => readStep<ProductUpdateImage>(reader, step, `steps[${index}]`, value => {
    const path = `steps[${index}].image.`;
    const image = reader.object(value, `"${path.slice(0, -1)}"`, ['src', 'alt', 'width', 'height', 'position']);
    if (!image) return value as ProductUpdateImage;
    if (typeof image.src !== 'string' || !image.src.startsWith('https://')) reader.errors.push(`"${path}src" precisa ser uma URL https.`);
    return withoutUndefined({ src: image.src as string, ...readImageSize(reader, image, path) });
  }));
  return reader.result({ id: fields.id as string, version, title, steps: parsedSteps as ProductUpdateStep[] });
}

export function releaseNoteImageUrl(repo: string, tag: string, file: string) {
  return `https://raw.githubusercontent.com/${repo}/${tag}/updates/notes/${file}`;
}

/** `notes` in the order the release shows them. */
export function assembleProductUpdate(tag: string, notes: readonly ReleaseNote[], repo: string): ProductUpdate {
  return {
    id: tag,
    version: tag,
    title: `Novidades da ${tag}`,
    steps: notes.map(({ image, ...note }) => {
      if (!image) return note;
      const { file, ...size } = image;
      return { ...note, image: { src: releaseNoteImageUrl(repo, tag, file), ...size } };
    }),
  };
}

export function androidProductUpdate(update: ProductUpdate): ProductUpdate {
  return {
    ...update,
    steps: update.steps.map(({ android, ...step }) => ({ ...step, ...android })),
  };
}

/** The `product-update.json` of the release tagged `tag`, or of the latest release. Release downloads have no API rate limit. */
export function productUpdateUrl(repo: string, tag: string | 'latest') {
  return tag === 'latest'
    ? `https://github.com/${repo}/releases/latest/download/${PRODUCT_UPDATE_ASSET}`
    : `https://github.com/${repo}/releases/download/${tag}/${PRODUCT_UPDATE_ASSET}`;
}

const PRODUCT_UPDATE_TIMEOUT_MS = 3000;

export type ProductUpdateDownload =
  | { status: 'found'; update: ProductUpdate }
  /** The release has no notes this client can show: no asset (404), or one that fails the parser or names another release. */
  | { status: 'missing' }
  /** Network error, timeout or server error. Worth trying again later. */
  | { status: 'failed' };

export type FetchProductUpdate = (url: string, init: { signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Downloads and validates a `product-update.json`, giving up after PRODUCT_UPDATE_TIMEOUT_MS. With `expectedId`, notes of another release count as missing. */
export async function downloadProductUpdate(url: string, expectedId: string | null, fetchImpl: FetchProductUpdate): Promise<ProductUpdateDownload> {
  let json: unknown;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(PRODUCT_UPDATE_TIMEOUT_MS) });
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) return { status: 'failed' };
    json = await response.json();
  } catch {
    return { status: 'failed' };
  }
  const parsed = parseProductUpdate(json);
  return parsed.ok && (expectedId === null || parsed.value.id === expectedId) ? { status: 'found', update: parsed.value } : { status: 'missing' };
}
