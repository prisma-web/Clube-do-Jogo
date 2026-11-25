#!/usr/bin/env node
// Notas de novidade em updates/notes/. Roda no Node 24 sem npm ci: o Node remove os tipos do parser do domínio.
//   check <base-sha> <head-sha> [--opt-out]   valida as notas do PR e exige uma, salvo --opt-out
//   assemble <tag> [--out <arquivo>]          gera o product-update.json do release com as notas adicionadas desde a tag anterior
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  assembleProductUpdate,
  parseReleaseNote,
  RELEASE_TAG,
  RELEASES_REPO,
} from '../packages/domain/src/product-updates.ts';

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

function check(base, head, optOut) {
  const changed = git(['diff', '--name-status', '--no-renames', `${base}...${head}`, '--', NOTES_DIR])
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t'))
    .filter(([status]) => status === 'A' || status === 'M')
    .map(([, path]) => path);
  const errors = [];
  const slugs = new Set();
  let addsNote = false;
  for (const path of changed) {
    const match = NOTE_FILE.exec(path);
    if (!match) {
      errors.push(`${path} não pertence a updates/notes/. Ali só entram <slug>.json e a captura <slug>.webp.`);
      continue;
    }
    if (match[2] === 'json') addsNote = true;
    slugs.add(match[1]);
  }
  for (const slug of slugs) {
    const result = readNote(head, slug);
    if (result.errors) errors.push(...result.errors);
    else console.log(`✓ ${NOTES_DIR}/${slug}.json`);
  }
  if (!addsNote && !optOut) {
    errors.push([
      'Este PR não adiciona nem altera nenhuma nota de novidade.',
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

function addedSlugs(range) {
  const slugs = [];
  const log = git(['log', '--topo-order', '--reverse', '--no-renames', '--diff-filter=A', '--name-only', '--format=', range, '--', NOTES_DIR]);
  for (const path of log.split('\n')) {
    const match = NOTE_FILE.exec(path);
    if (match?.[2] === 'json' && !slugs.includes(match[1])) slugs.push(match[1]);
  }
  return slugs;
}

function assemble(tag, out) {
  if (!RELEASE_TAG.test(tag)) {
    console.error(`A tag ${tag} não é vX.Y.Z.`);
    return 1;
  }
  const previous = git(['tag', '--merged', tag, '--list', 'v*'])
    .split('\n')
    .filter(candidate => RELEASE_TAG.test(candidate) && compareTags(candidate, tag) < 0)
    .sort(compareTags)
    .at(-1);
  const slugs = addedSlugs(previous ? `${previous}..${tag}` : tag).filter(slug => blob(tag, `${NOTES_DIR}/${slug}.json`));
  const since = previous ? `desde ${previous}` : 'no histórico';
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

function main([command, ...args]) {
  if (command === 'check' && args.length >= 2) return check(args[0], args[1], args.includes('--opt-out'));
  if (command === 'assemble' && args.length >= 1) {
    const outIndex = args.indexOf('--out');
    return assemble(args[0], outIndex >= 0 ? args[outIndex + 1] : 'product-update.json');
  }
  console.error('Uso: release-notes.mjs check <base-sha> <head-sha> [--opt-out] | assemble <tag> [--out <arquivo>]');
  return 2;
}

process.exitCode = main(process.argv.slice(2));
