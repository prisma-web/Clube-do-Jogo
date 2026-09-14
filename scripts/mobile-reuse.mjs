import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const clients = { web: ['src'], mobile: ['apps/mobile/src', 'apps/mobile/app'] };
const packages = ['@clube-do-jogo/domain', '@clube-do-jogo/data'];
const result = Object.fromEntries(packages.map(name => [name, { web: [], mobile: [] }]));

function* sources(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec|d)\.tsx?$/.test(entry.name)) yield path;
  }
}

for (const [client, directories] of Object.entries(clients)) {
  for (const directory of directories) {
    for (const path of sources(join(root, directory))) {
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
        const modulePath = statement.moduleSpecifier;
        if (!modulePath || !ts.isStringLiteral(modulePath)) continue;
        const packageName = packages.find(name => modulePath.text === name || modulePath.text.startsWith(`${name}/`));
        if (!packageName) continue;
        const clause = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : statement.exportClause;
        const bindings = clause && (ts.isNamedImports(clause) || ts.isNamedExports(clause))
          ? clause.elements.map(element => (element.propertyName ?? element.name).text)
          : ['*'];
        result[packageName][client].push({ file: relative(root, path), module: modulePath.text, bindings });
      }
    }
  }
}

for (const usage of Object.values(result)) {
  usage.directConsumerFiles = Object.fromEntries(Object.keys(clients).map(client => [client, new Set(usage[client].map(item => item.file)).size]));
  const webBindings = new Set(usage.web.flatMap(item => item.bindings));
  usage.sharedNamedBindings = [...new Set(usage.mobile.flatMap(item => item.bindings))]
    .filter(name => name !== '*' && webBindings.has(name)).sort();
}

process.stdout.write(`${JSON.stringify({
  scope: 'Static direct imports and re-exports, including types; web facades count once. This is not a percentage of shared UI or duplicated logic.',
  packages: result,
}, null, 2)}\n`);
