#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_ROOTS = ['apps/mobile/src', 'apps/mobile/app'];
const THEME_MODULE = '@/theme';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const roots = args.filter(arg => !arg.startsWith('--'));

async function collectFiles(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await collectFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function hookName(identifier) {
  return `use${identifier[0].toUpperCase()}${identifier.slice(1)}`;
}

function isValueReference(node, name) {
  if (!ts.isIdentifier(node) || node.text !== name) return false;
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  if (ts.isBindingElement(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  return true;
}

function referencesAny(root, names) {
  const found = new Set();
  const visit = node => {
    for (const name of names) {
      if (isValueReference(node, name)) found.add(name);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return found;
}

function namedImport(source, moduleName) {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== moduleName) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    return { statement, bindings };
  }
  return null;
}

function collectReferences(root, name) {
  const positions = [];
  const visit = node => {
    if (isValueReference(node, name)) positions.push(node.getStart());
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return positions;
}

function sheetDeclarations(source) {
  const sheets = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer)) continue;
      const callee = initializer.expression;
      const isCreate = ts.isPropertyAccessExpression(callee)
        && ts.isIdentifier(callee.expression)
        && callee.expression.text === 'StyleSheet'
        && callee.name.text === 'create';
      if (!isCreate || !ts.isIdentifier(declaration.name)) continue;
      sheets.push({ declaration, initializer, name: declaration.name.text });
    }
  }
  return sheets;
}

function componentBodies(source) {
  const components = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      components.push({ name: statement.name.text, body: statement.body, node: statement });
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isIdentifier(declaration.name)) continue;
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        components.push({ name: declaration.name.text, body: initializer.body, node: statement });
      }
    }
  }
  return components;
}

function isHookSafeName(name) {
  return /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
}

function migrate(file, text) {
  const source = parse(file, text);
  const problems = [];

  if (/\bthemedStyles\b/.test(text)) return { changed: false, problems };

  const imported = namedImport(source, THEME_MODULE);
  if (!imported) return { changed: false, problems };
  const colorsSpecifier = imported.bindings.elements.find(element => element.name.text === 'colors' && !element.propertyName);
  if (!colorsSpecifier) return { changed: false, problems };

  const sheets = sheetDeclarations(source);
  const sheetNames = sheets.map(sheet => sheet.name);
  const edits = [];

  for (const sheet of sheets) {
    const objectText = sheet.initializer.arguments[0]?.getText(source);
    if (!objectText) {
      problems.push(`${file}: StyleSheet.create sem objeto literal em '${sheet.name}'`);
      return { changed: false, problems };
    }
    edits.push({
      start: sheet.declaration.getStart(source),
      end: sheet.declaration.getEnd(),
      text: `${hookName(sheet.name)} = themedStyles(colors => (${objectText}))`,
    });
  }

  const components = componentBodies(source);
  let needsColorsHook = false;

  for (const component of components) {
    const used = referencesAny(component.body, ['colors', ...sheetNames]);
    if (used.size === 0) continue;
    if (!ts.isBlock(component.body)) {
      problems.push(`${file}: '${component.name}' tem corpo de expressão, migre manualmente`);
      return { changed: false, problems };
    }
    if (!isHookSafeName(component.name)) {
      problems.push(`${file}: '${component.name}' não parece um componente, migre manualmente`);
      return { changed: false, problems };
    }
    const lines = [];
    if (used.has('colors')) {
      lines.push('const colors = useThemeColors();');
      needsColorsHook = true;
    }
    for (const name of sheetNames) {
      if (used.has(name)) lines.push(`const ${name} = ${hookName(name)}();`);
    }
    const indent = '  ';
    edits.push({
      start: component.body.getStart(source) + 1,
      end: component.body.getStart(source) + 1,
      text: `\n${lines.map(line => indent + line).join('\n')}`,
    });
  }

  const moduleScopeUses = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    const isSheet = sheets.some(sheet => sheet.declaration.parent.parent === statement);
    const isComponent = components.some(component => component.node === statement);
    if (isSheet || isComponent) continue;
    if (referencesAny(statement, ['colors', ...sheetNames]).size > 0) {
      moduleScopeUses.push(statement.getStart(source));
    }
  }
  if (moduleScopeUses.length > 0) {
    problems.push(`${file}: uso de 'colors' fora de componentes, migre manualmente`);
    return { changed: false, problems };
  }

  const replacement = [];
  if (sheets.length > 0) replacement.push('themedStyles');
  if (needsColorsHook) replacement.push('useThemeColors');
  if (replacement.length === 0) return { changed: false, problems };
  edits.push({
    start: colorsSpecifier.getStart(source),
    end: colorsSpecifier.getEnd(),
    text: replacement.join(', '),
  });

  const converted = new Set(sheets.map(sheet => sheet.initializer.expression.expression.getStart(source)));
  const stillUsesStyleSheet = collectReferences(source, 'StyleSheet').some(position => !converted.has(position));
  if (!stillUsesStyleSheet) {
    const reactNative = namedImport(source, 'react-native');
    const specifier = reactNative?.bindings.elements.find(element => element.name.text === 'StyleSheet' && !element.propertyName);
    if (reactNative && specifier) {
      const kept = reactNative.bindings.elements.filter(element => element !== specifier).map(element => element.getText(source));
      if (kept.length === 0 && !reactNative.statement.importClause?.name) {
        edits.push({ start: reactNative.statement.getStart(source), end: reactNative.statement.getEnd(), text: '' });
      } else {
        edits.push({
          start: reactNative.bindings.getStart(source),
          end: reactNative.bindings.getEnd(),
          text: `{ ${kept.join(', ')} }`,
        });
      }
    }
  }

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let output = text;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return { changed: output !== text, output, problems };
}

const files = [];
for (const root of roots.length > 0 ? roots : DEFAULT_ROOTS) {
  await collectFiles(resolve(repoRoot, root), files);
}

let changedCount = 0;
const allProblems = [];
for (const file of files.sort()) {
  const text = readFileSync(file, 'utf8');
  const result = migrate(file, text);
  allProblems.push(...result.problems.map(problem => problem.replace(`${repoRoot}/`, '')));
  if (!result.changed) continue;
  changedCount += 1;
  if (checkOnly) console.log(`pendente: ${relative(repoRoot, file)}`);
  else {
    writeFileSync(file, result.output);
    console.log(`migrado: ${relative(repoRoot, file)}`);
  }
}

for (const problem of allProblems) console.warn(`atenção: ${problem}`);
console.log(`${changedCount} arquivo(s) ${checkOnly ? 'pendentes' : 'migrados'}, ${allProblems.length} aviso(s).`);
if (checkOnly && changedCount > 0) process.exitCode = 1;
