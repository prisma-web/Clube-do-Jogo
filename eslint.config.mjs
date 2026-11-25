import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { noUnnecessaryCommentsPlugin } from "./eslint/no-unnecessary-comments.mjs";

const SOURCE_EXT = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
const ALL_SOURCE_FILES = `**/*.${SOURCE_EXT}`;
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

const TABLE_ACCESS_SELECTOR = [
  "CallExpression[callee.type='MemberExpression'][callee.property.name='from']",
  ":not([callee.object.name=/^[A-Z]/])",
  ":not([callee.object.property.name=/^[A-Z]/])",
  ":not([callee.object.property.name='storage'])",
  ":matches([arguments.0.type='Literal'], [arguments.0.type='TemplateLiteral'], [callee.object.name=/supabase|client/i], [callee.object.property.name=/supabase|client/i], [callee.object.callee.property.name='schema'])",
].join("");

const webImportsApps = "The web must not import apps/. Move shared code to packages/domain or packages/data.";

const boundaryConfigs = [
  ...perDepth("packages/domain", (depth) => domainImports(depth)),
  ...perDepth("packages/domain", (depth) => domainImports(depth, { tests: true }), "*.test.ts"),
  ...perDepth("packages/data", (depth) => dataImports(depth)),
  ...perDepth("packages/data", (depth) => dataImports(depth, { tests: true }), "*.test.ts"),

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

const noUnnecessaryCommentsConfigs = [
  {
    files: [ALL_SOURCE_FILES],
    plugins: { local: noUnnecessaryCommentsPlugin },
    rules: {
      "local/no-unnecessary-comments": "error",
    },
  },
  {
    files: ["**/*.css"],
    plugins: { local: noUnnecessaryCommentsPlugin },
    language: "local/css",
    rules: {
      "local/no-unnecessary-comments": "error",
    },
  },
  {
    files: ["**/*.sql"],
    plugins: { local: noUnnecessaryCommentsPlugin },
    language: "local/sql",
    rules: {
      "local/no-unnecessary-comments": "error",
    },
  },
  {
    files: ["**/*.{yml,yaml}"],
    plugins: { local: noUnnecessaryCommentsPlugin },
    language: "local/yaml",
    rules: {
      "local/no-unnecessary-comments": "error",
    },
  },
  {
    files: [
      "**/*.sh",
      ".agents/skills/verify-clube-do-jogo-mobile/scripts/verify-mobile",
      ".agents/skills/verify-clube-do-jogo-mobile/scripts/test-verify-mobile",
      ".agents/skills/verify-clube-do-jogo-web/scripts/verify-clube-do-jogo-web",
    ],
    plugins: { local: noUnnecessaryCommentsPlugin },
    language: "local/shell",
    rules: {
      "local/no-unnecessary-comments": "error",
    },
  },
  {
    files: ["**/*.tla", ".agents/skills/formal-verify-pending-notes-mobile/model/*.cfg"],
    plugins: { local: noUnnecessaryCommentsPlugin },
    language: "local/tla",
    rules: {
      "local/no-unnecessary-comments": "error",
    },
  },
];

const eslintConfig = defineConfig([
  {
    files: [ALL_SOURCE_FILES],
    extends: [nextVitals, nextTs],
  },
  {
    files: [ALL_SOURCE_FILES],
    rules: {
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
  ...noUnnecessaryCommentsConfigs,
  globalIgnores([
    ".next/**",
    ".next-dev/**",
    ".next-build/**",
    "out/**",
    "build/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "evidence/**",
    "state/**",
    "supabase/.temp/**",
    ".vercel/**",
    ".claude/**",
    ".agents/**/.cache/**",
    "next-env.d.ts",
    "apps/mobile/expo-env.d.ts",
    "apps/mobile/.expo/**",
    "apps/mobile/dist/**",
    "apps/mobile/android/**",
    "apps/mobile/ios/**",
  ]),
]);

export default eslintConfig;
