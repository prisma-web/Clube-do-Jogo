#!/usr/bin/env node
// Notas de novidade em updates/notes/. Roda sem npm ci: o Node remove os tipos do parser do domínio ao importá-lo.
//   check <base-sha> <head-sha> [--opt-out]                  valida as notas que o PR toca e exige uma nota nova, salvo --opt-out
//   assemble <tag> --released <tags> [--out <arquivo>]       gera o product-update.json com as notas adicionadas desde o release anterior
// --released lista, separadas por vírgula, as tags com release publicado no GitHub (pode ser vazia).
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Antes do Node 22.18, a remoção de tipos fica atrás de uma flag.
if (!process.features.typescript) {
  const flags = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
  const { status } = spawnSync(process.execPath, [...flags, ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(status ?? 1);
}

const { assembleProductUpdate, parseReleaseNote, RELEASE_TAG, RELEASES_REPO } = await import('../packages/domain/src/product-updates.ts');

const NOTES_DIR = 'updates/notes';
const NOTE_FILE = /^updates\/notes\/([^/]+)\.(json|webp)$/;
const MAX_IMAGE_BYTES = 300 * 1024;
const GUIDE = '.claude/skills/release-note/SKILL.md';
const OPT_OUT_LABEL = 'sem-novidade';

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, { encoding, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function blob(rev, path) {
  try {
    return git(['cat-file', 'blob', `${rev}:${path}`], 'buffer');
  } catch {
    return null;
  }
}

function webpSize(bytes) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  switch (bytes.toString('ascii', 12, 16)) {
    case 'VP8 ':
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    case 'VP8L': {
      if (bytes[20] !== 0x2f) return null;
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case 'VP8X':
      return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    default:
      return null;
  }
}

/** The parsed note at `rev`, or the pt-BR errors that make it invalid. */
function readNote(rev, slug) {
  const path = `${NOTES_DIR}/${slug}.json`;
  const raw = blob(rev, path);
  if (!raw) return { errors: [`${path} não existe. Cada ${slug}.webp precisa da nota ${slug}.json.`] };
  let json;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    return { errors: [`${path} não é um JSON válido: ${error.message}`] };
  }
  const parsed = parseReleaseNote(json, slug);
  if (!parsed.ok) return { errors: parsed.errors.map(error => `${path}: ${error}`) };
  const { image } = parsed.value;
  if (!image) return { note: parsed.value };
  const imagePath = `${NOTES_DIR}/${image.file}`;
  const bytes = blob(rev, imagePath);
  if (!bytes) return { errors: [`${path}: "image.file" aponta para ${imagePath}, que não existe. Adicione a captura ou remova "image".`] };
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { errors: [`${imagePath} tem ${Math.ceil(bytes.length / 1024)} KB e o limite é 300 KB. Recomprima com cwebp -q 75 -resize 860 0.`] };
  }
  const size = webpSize(bytes);
  if (!size) return { errors: [`${imagePath} não é um WebP válido. Gere com cwebp a partir de uma captura PNG.`] };
  if (size.width !== image.width || size.height !== image.height) {
    return { errors: [`${path}: "image" diz ${image.width}x${image.height}, mas ${imagePath} tem ${size.width}x${size.height}. Use "width": ${size.width} e "height": ${size.height}.`] };
  }
  return { note: parsed.value };
}

function exists(rev, path) {
  return blob(rev, path) !== null;
}

function check(base, head, optOut) {
  // Com detecção de renomeação, renomear uma nota é R, não A: não conta como nota nova.
  const changes = git(['diff', '--name-status', '--find-renames', `${base}...${head}`, '--', NOTES_DIR])
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t'));
  const errors = [];
  const slugs = new Set();
  let addsNote = false;
  for (const [status, ...paths] of changes) {
    for (const path of paths) {
      const slug = NOTE_FILE.exec(path)?.[1];
      if (slug) slugs.add(slug);
    }
    const current = status === 'D' ? null : paths.at(-1);
    if (current && !NOTE_FILE.test(current)) {
      errors.push(`${current} não pertence a updates/notes/. Ali só entram <slug>.json e a captura <slug>.webp.`);
    }
    if (status === 'A' && NOTE_FILE.exec(current)?.[2] === 'json') addsNote = true;
  }
  for (const slug of slugs) {
    const json = `${NOTES_DIR}/${slug}.json`;
    if (!exists(head, json) && !exists(head, `${NOTES_DIR}/${slug}.webp`)) {
      console.log(`✓ ${json} removida`);
      continue;
    }
    const result = readNote(head, slug);
    if (result.errors) errors.push(...result.errors);
    else console.log(`✓ ${json}`);
  }
  if (!addsNote && !optOut) {
    errors.push([
      'Este PR não adiciona nenhuma nota de novidade. Editar ou renomear uma nota que já existe não conta.',
      `Se a mudança aparece para quem usa o app, adicione ${NOTES_DIR}/<slug>.json seguindo ${GUIDE}.`,
      `Se nada muda para quem usa o app (infra, CI, testes, refatoração), coloque a label ${OPT_OUT_LABEL} no PR.`,
    ].join('\n'));
  }
  if (errors.length) {
    console.error(errors.join('\n\n'));
    return 1;
  }
  console.log(addsNote ? 'Notas de novidade válidas.' : `Label ${OPT_OUT_LABEL}: este PR não precisa de nota de novidade.`);
  return 0;
}

function compareTags(a, b) {
  const [, ...left] = RELEASE_TAG.exec(a).map(Number);
  const [, ...right] = RELEASE_TAG.exec(b).map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

/** Slugs of the notes added in `range`, in commit order. A renamed note keeps its place, and renaming a released note adds nothing. */
function addedSlugs(range) {
  const paths = [];
  const log = git(['log', '--topo-order', '--reverse', '--find-renames', '--diff-filter=AR', '--name-status', '--format=', range, '--', NOTES_DIR]);
  for (const line of log.split('\n').filter(Boolean)) {
    const [status, from, to] = line.split('\t');
    if (status === 'A' && !paths.includes(from)) paths.push(from);
    else if (status.startsWith('R') && paths.includes(from)) paths[paths.indexOf(from)] = to;
  }
  return paths.map(path => NOTE_FILE.exec(path)).filter(match => match?.[2] === 'json').map(match => match[1]);
}

/** The highest published release below `tag` in its history. A tag whose build failed has no release, so its notes go to the next one. */
function previousRelease(tag, released) {
  return git(['tag', '--merged', tag, '--list', 'v*'])
    .split('\n')
    .filter(candidate => released.includes(candidate) && RELEASE_TAG.test(candidate) && compareTags(candidate, tag) < 0)
    .sort(compareTags)
    .at(-1);
}

function assemble(tag, released, out) {
  if (!RELEASE_TAG.test(tag)) {
    console.error(`A tag ${tag} não é vX.Y.Z.`);
    return 1;
  }
  const previous = previousRelease(tag, released);
  const slugs = addedSlugs(previous ? `${previous}..${tag}` : tag).filter(slug => exists(tag, `${NOTES_DIR}/${slug}.json`));
  const since = previous ? `desde o release ${previous}` : 'no histórico';
  if (slugs.length === 0) {
    console.log(`Nenhuma nota adicionada ${since} até ${tag}. ${out} não foi gerado.`);
    return 0;
  }
  const results = slugs.map(slug => readNote(tag, slug));
  const errors = results.flatMap(result => result.errors ?? []);
  if (errors.length) {
    console.error(errors.join('\n'));
    return 1;
  }
  const update = assembleProductUpdate(tag, results.map(result => result.note), process.env.GITHUB_REPOSITORY || RELEASES_REPO);
  writeFileSync(out, `${JSON.stringify(update, null, 2)}\n`);
  console.log(`${out}: ${slugs.length} nota(s) adicionada(s) ${since} até ${tag}: ${slugs.join(', ')}.`);
  return 0;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function main([command, ...args]) {
  if (command === 'check' && args.length >= 2) return check(args[0], args[1], args.includes('--opt-out'));
  const released = option(args, '--released');
  if (command === 'assemble' && args.length >= 1 && released !== undefined) {
    return assemble(args[0], released.split(',').map(tag => tag.trim()).filter(Boolean), option(args, '--out') ?? 'product-update.json');
  }
  console.error('Uso: release-notes.mjs check <base-sha> <head-sha> [--opt-out] | assemble <tag> --released <tags> [--out <arquivo>]');
  return 2;
}

process.exitCode = main(process.argv.slice(2));
