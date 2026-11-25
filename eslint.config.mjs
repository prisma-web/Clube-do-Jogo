import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// --- Workspace boundaries (see "Repository map" in AGENTS.md) ---------------
//
// no-restricted-imports only sees the import string, so "leaves this workspace
// by a relative path" is encoded per directory depth: a file N directories
// below the workspace root escapes it with N+1 leading "../". One config object
// per depth; `*` does not cross "/", so each glob matches exactly one depth.
// Later objects replace the rule options of earlier ones for the same file.
const SOURCE_EXT = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
const MAX_DEPTH = 12;

function escapesRoot(depth, rest = "") {
  return `^(\\./)?(\\.\\./){${depth + 1}}${rest}`;
}

function perDepth(root, buildPatterns, fileName = `*.${SOURCE_EXT}`) {
  return Array.from({ length: MAX_DEPTH + 1 }, (_, depth) => ({
    files: [`${root}/${"*/".repeat(depth)}${fileName}`],
    rules: {
      "no-restricted-imports": ["error", { patterns: buildPatterns(depth) }],
    },
  }));
}

function domainImports(depth, { tests = false } = {}) {
  return [
    {
      regex: escapesRoot(depth),
      message: "packages/domain must not import outside itself by path. Platform code belongs in src/ (web) or apps/mobile.",
    },
    {
      regex: "^(?![./]|node:)",
      message: "packages/domain has no dependencies. Supabase/data access goes in packages/data; React, Next and Expo code in src/ or apps/mobile.",
    },
    ...(tests ? [] : [noNodeInPackageSource]),
  ];
}

function dataImports(depth, { tests = false } = {}) {
  return [
    {
      regex: escapesRoot(depth),
      message: "packages/data must not import outside itself by path. Use @clube-do-jogo/domain; platform code belongs in src/ or apps/mobile.",
    },
    {
      regex: "^(?![./]|node:|@clube-do-jogo/domain(/|$)|@supabase/supabase-js$)",
      message: "packages/data may import only @clube-do-jogo/domain and @supabase/supabase-js (its package.json). Next, React Native and Expo code belongs in src/ or apps/mobile.",
    },
    ...(tests ? [] : [noNodeInPackageSource]),
  ];
}

const noNodeInPackageSource = {
  regex: "^node:",
  message: "Both apps bundle this package, so Node built-ins are allowed only in *.test.ts. Node-only code goes in src/lib or scripts.",
};

// Table access: `x.from('t')`, `x.from(`t`)`, `supabase.from(anything)`,
// `client.from(...)`, `x.schema(...).from(...)`. Capitalised receivers
// (Array.from, Uint8Array.from, Buffer.from, Temporal.Instant.from) and
// `.storage.from(bucket)` (Storage, not a table) are not matched.
const TABLE_ACCESS_SELECTOR = [
  "CallExpression[callee.type='MemberExpression'][callee.property.name='from']",
  ":not([callee.object.name=/^[A-Z]/])",
  ":not([callee.object.property.name=/^[A-Z]/])",
  ":not([callee.object.property.name='storage'])",
  ":matches([arguments.0.type='Literal'], [arguments.0.type='TemplateLiteral'], [callee.object.name=/supabase|client/i], [callee.object.property.name=/supabase|client/i], [callee.object.callee.property.name='schema'])",
].join("");

const webImportsApps = "The web must not import apps/. Move shared code to packages/domain or packages/data.";

const boundaryConfigs = [
  // packages/domain: pure TypeScript with no dependencies (its package.json declares none).
  ...perDepth("packages/domain", (depth) => domainImports(depth)),
  ...perDepth("packages/domain", (depth) => domainImports(depth, { tests: true }), "*.test.ts"),
  // packages/data: only what its package.json declares.
  ...perDepth("packages/data", (depth) => dataImports(depth)),
  ...perDepth("packages/data", (depth) => dataImports(depth, { tests: true }), "*.test.ts"),

  // apps/mobile: shared code comes from the packages by name, never from the
  // web's src/. (Images under the repo's public/ are shared on purpose.)
  ...perDepth("apps/mobile", (depth) => [
    {
      regex: escapesRoot(depth + 1, "src/"),
      message: "apps/mobile must not import the web's src/. Move shared code to packages/domain or packages/data and import it by name.",
    },
    {
      regex: escapesRoot(depth + 1, "packages/"),
      message: "Import shared packages by name (@clube-do-jogo/domain, @clube-do-jogo/data), not by path.",
    },
  ]),
  {
    files: [`apps/mobile/**/*.${SOURCE_EXT}`],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: TABLE_ACCESS_SELECTOR,
        message: "No table access in the app. Add or use a DataClient method in packages/data/src/client.ts.",
      }],
    },
  },

  // Web (src/): never the mobile app; packages by name.
  ...perDepth("src", (depth) => [
    { regex: escapesRoot(depth, "apps/"), message: webImportsApps },
    { regex: "^@clube-do-jogo/mobile(/|$)", message: webImportsApps },
    {
      regex: escapesRoot(depth, "packages/"),
      message: "Import shared packages by name (@clube-do-jogo/domain, @clube-do-jogo/data), not by path.",
    },
  ]),
  {
    files: [`src/app/**/*.${SOURCE_EXT}`, `src/components/**/*.${SOURCE_EXT}`, `src/hooks/**/*.${SOURCE_EXT}`],
    ignores: ["src/app/api/**"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: TABLE_ACCESS_SELECTOR,
        message: "No table access in web UI. Use useApp().dataClient (DataClient in packages/data/src/client.ts); server-only queries go in src/app/api.",
      }],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // As capas e avatares vêm de hosts definidos pelos usuários/IGDB; não há
      // uma allowlist segura e estável para o otimizador de imagens do Next.
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["apps/mobile/**/*.tsx"],
    rules: {
      "jsx-a11y/alt-text": "off",
    },
  },
  {
    files: ["apps/mobile/metro.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  ...boundaryConfigs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-dev/**",
    ".next-build/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "apps/mobile/.expo/**",
    "apps/mobile/dist/**",
    "apps/mobile/android/**",
    "apps/mobile/ios/**",
  ]),
]);

export default eslintConfig;
