import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { voteChoiceOptions } from '../../apps/mobile/src/components/vote-choice-options';

// O rótulo curto (label) cabe no botão. O leitor de tela lê accessibilityName, a frase
// inteira (vote-choice-options.ts). O teste acha cada voteChoiceOptions.map, lê o nome
// que o callback dá ao item, seja qual for, e confere os accessibilityLabel dentro dele.
const MOBILE = path.join(process.cwd(), 'apps/mobile');

function sources() {
  return ['app', 'src'].flatMap(dir => readdirSync(path.join(MOBILE, dir), { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.tsx'))
    .map(entry => path.relative(MOBILE, path.join(entry.parentPath, entry.name))))
    .map(file => [file, readFileSync(path.join(MOBILE, file), 'utf8')] as const);
}

/** O trecho entre o delimitador que abre em `start` e o que o fecha. */
function balanced(source: string, start: number) {
  const open = source[start];
  const close = open === '(' ? ')' : '}';
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === open) depth++;
    if (source[index] === close && --depth === 0) return source.slice(start + 1, index);
  }
  throw new Error(`${open} sem fechamento`);
}

type Label = { file: string; item: string; label: string };

function choiceLabels(): Label[] {
  return sources().flatMap(([file, source]) => [...source.matchAll(/voteChoiceOptions\.map\(/g)].flatMap(match => {
    const callback = balanced(source, match.index + match[0].length - 1);
    // option => …, (option) => …, ({ label, accessibilityName }) => …
    const item = callback.match(/^\s*\(?\s*(\{[^}]*\}|\w+)/)?.[1];
    assert.ok(item, `${file}: callback de voteChoiceOptions.map sem parâmetro`);
    return [...callback.matchAll(/accessibilityLabel=\{/g)].map(label => ({ file, item, label: balanced(callback, label.index + label[0].length - 1) }));
  }));
}

test('every choice button reads the full choice name to the screen reader', () => {
  const labels = choiceLabels();
  // As quatro telas que listam as escolhas: botões, sheet de participantes, ranking e jogo.
  assert.ok(labels.length >= 4, `achou ${labels.length} accessibilityLabel de escolha`);
  const shortName = labels.filter(({ item, label }) => {
    const reads = (field: string) => (item.startsWith('{') ? new RegExp(`\\b${field}\\b`).test(label) && item.includes(field) : label.includes(`${item}.${field}`));
    return reads('label') || !reads('accessibilityName');
  });
  assert.deepEqual(shortName.map(({ file, label }) => `${file}: ${label}`), []);
});

test('each choice gives the screen reader its full name', () => {
  assert.deepEqual(voteChoiceOptions.map(option => option.accessibilityName), ['Não jogaria', 'Neutro', 'Jogaria']);
});
