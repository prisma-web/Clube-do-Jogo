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

export type ReleaseNote = StepCopy<ReleaseNoteImage>;
export type ProductUpdateStep = StepCopy<ProductUpdateImage>;

export interface ProductUpdate {
  id: string;
  version: string;
  title: string;
  steps: ProductUpdateStep[];
}

export interface ProductUpdateHistory {
  id: string;
  releases: ProductUpdate[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const RELEASES_REPO = 'prisma-web/Clube-do-Jogo';
export const PRODUCT_UPDATE_ASSET = 'product-update.json';
export const PRODUCT_UPDATE_HISTORY_ASSET = 'product-updates.json';
export const PRODUCT_UPDATE_HISTORY_RELEASES = 25;
export const PRODUCT_UPDATE_STEP_LIMIT = 10;
export const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const NOTE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const POSITIONS: readonly string[] = ['top', 'center', 'bottom'];
const ARTWORKS: readonly string[] = ['overview', 'performance'];

export function productUpdateStorageKey(updateId: string) {
  return `clube-do-jogo:product-update:${updateId}:completed`;
}

const SEEN_KEY = /^clube-do-jogo:product-update:(v\d+\.\d+\.\d+):completed$/;

export function productUpdateSeenTag(storageKey: string): string | null {
  const tag = SEEN_KEY.exec(storageKey)?.[1];
  return tag && RELEASE_TAG.test(tag) ? tag : null;
}

export function compareReleaseTags(a: string, b: string): number {
  const left = RELEASE_TAG.exec(a)!.slice(1).map(Number);
  const right = RELEASE_TAG.exec(b)!.slice(1).map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
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

export function parseProductUpdateHistory(json: unknown): Parsed<ProductUpdateHistory> {
  const fields = typeof json === 'object' && json !== null && !Array.isArray(json) ? json as Fields : {};
  const { id, releases } = fields;
  if (typeof id !== 'string' || !RELEASE_TAG.test(id)) return { ok: false, errors: ['"id" precisa ser uma tag vX.Y.Z.'] };
  const parsed = (Array.isArray(releases) ? releases : [])
    .map(parseProductUpdate)
    .flatMap(result => result.ok && compareReleaseTags(result.value.id, id) <= 0 ? [result.value] : [])
    .sort((a, b) => compareReleaseTags(b.id, a.id))
    .filter((release, index, sorted) => index === 0 || sorted[index - 1].id !== release.id);
  return parsed.length ? { ok: true, value: { id, releases: parsed } } : { ok: false, errors: ['"releases" precisa ter pelo menos uma novidade válida.'] };
}

export function releaseNoteImageUrl(repo: string, tag: string, file: string) {
  return `https://raw.githubusercontent.com/${repo}/${tag}/updates/notes/${file}`;
}

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

export function githubReleasesUrl(repo: string) {
  return `https://github.com/${repo}/releases`;
}

export function releaseAssetUrl(releases: string, tag: string | 'latest', asset: string) {
  return tag === 'latest' ? `${releases}/latest/download/${asset}` : `${releases}/download/${tag}/${asset}`;
}

export interface ProductUpdateDigest {
  id: string;
  pending: boolean;
  pages: ProductUpdate[][];
}

export function productUpdateHistoryTags(history: ProductUpdateHistory): string[] {
  return [...new Set([history.id, ...history.releases.map(release => release.id)])];
}

function newestTag(tags: Iterable<string | null | undefined>, below?: string): string | null {
  let newest: string | null = null;
  for (const tag of tags) {
    if (!tag || !RELEASE_TAG.test(tag) || (below && compareReleaseTags(tag, below) >= 0)) continue;
    if (!newest || compareReleaseTags(tag, newest) > 0) newest = tag;
  }
  return newest;
}

export function productUpdatePages(releases: readonly ProductUpdate[], limit = PRODUCT_UPDATE_STEP_LIMIT): ProductUpdate[][] {
  const pages: ProductUpdate[][] = [];
  let steps = 0;
  for (const release of releases) {
    const page = pages.at(-1);
    if (page && steps + release.steps.length <= limit) {
      page.push(release);
      steps += release.steps.length;
    } else {
      pages.push([release]);
      steps = release.steps.length;
    }
  }
  return pages;
}

export function productUpdateDigest(
  history: ProductUpdateHistory,
  { seen, installedBefore = null }: { seen: Iterable<string>; installedBefore?: string | null },
  limit = PRODUCT_UPDATE_STEP_LIMIT,
): ProductUpdateDigest {
  const lastSeen = newestTag(seen);
  const cameFrom = newestTag([installedBefore], history.id);
  const unseen = history.releases.filter(({ id }) => {
    if (lastSeen) return compareReleaseTags(id, lastSeen) > 0;
    if (cameFrom) return compareReleaseTags(id, cameFrom) >= 0;
    return id === history.id;
  });
  if (unseen.length > 0) return { id: history.id, pending: true, pages: productUpdatePages(unseen, limit) };
  const [latest, ...older] = history.releases;
  return { id: history.id, pending: false, pages: [[latest], ...productUpdatePages(older, limit)] };
}

export function productUpdateVersions(releases: readonly ProductUpdate[]): string {
  const newest = releases[0].version;
  const oldest = releases[releases.length - 1].version;
  return newest === oldest ? newest : `${oldest} à ${newest}`;
}

export function productUpdateTitle(releases: readonly ProductUpdate[]): string {
  return `Novidades da ${productUpdateVersions(releases)}`;
}

export function productUpdateSteps(releases: readonly ProductUpdate[]): (ProductUpdateStep & { version: string })[] {
  return releases.flatMap(release => release.steps.map(step => ({ ...step, version: release.version })));
}

export function moreProductUpdatesLabel(pages: readonly ProductUpdate[][]): string | null {
  const releases = pages.flat();
  if (releases.length === 0) return null;
  const notes = releases.reduce((total, release) => total + release.steps.length, 0);
  const versions = releases.length === 1 ? `da ${releases[0].version}` : `de ${releases.length} versões anteriores (${productUpdateVersions(releases)})`;
  return `Mais ${notes} ${notes === 1 ? 'novidade' : 'novidades'} ${versions}`;
}

const PRODUCT_UPDATE_TIMEOUT_MS = 3000;

export type Download<T> =
  | { status: 'found'; update: T }
  | { status: 'missing' }
  | { status: 'failed' };

export type FetchProductUpdate = (url: string, init: { signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function downloadProductUpdate(url: string, expectedId: string | null, fetchImpl: FetchProductUpdate): Promise<Download<ProductUpdate>> {
  return download(url, expectedId, fetchImpl, parseProductUpdate);
}

export function downloadProductUpdateHistory(url: string, expectedId: string | null, fetchImpl: FetchProductUpdate): Promise<Download<ProductUpdateHistory>> {
  return download(url, expectedId, fetchImpl, parseProductUpdateHistory);
}

async function download<T extends { id: string }>(
  url: string,
  expectedId: string | null,
  fetchImpl: FetchProductUpdate,
  parse: (json: unknown) => Parsed<T>,
): Promise<Download<T>> {
  let json: unknown;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(PRODUCT_UPDATE_TIMEOUT_MS) });
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) return { status: 'failed' };
    json = await response.json();
  } catch {
    return { status: 'failed' };
  }
  const parsed = parse(json);
  return parsed.ok && (expectedId === null || parsed.value.id === expectedId) ? { status: 'found', update: parsed.value } : { status: 'missing' };
}
