import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";
import {
  isNecessaryComment,
  isNecessaryJsComment,
  scanCssComments,
  scanShellComments,
  scanSqlComments,
  scanTlaComments,
  scanYamlComments,
} from "../../eslint/no-unnecessary-comments.mjs";

const eslint = new ESLint();

async function lintRuleMessages(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "local/no-unnecessary-comments");
}

test("JS/TS aceita apenas comentários tecnicamente necessários", () => {
  const allowed = [
    { type: "Shebang", value: "/usr/bin/env node" },
    { type: "Line", value: " eslint-disable-next-line no-console" },
    { type: "Line", value: " eslint-disable-next-line no-restricted-syntax -- motivo" },
    { type: "Line", value: " eslint-disable-line @typescript-eslint/no-explicit-any" },
    { type: "Block", value: " eslint-disable no-console " },
    { type: "Block", value: " eslint-enable no-console " },
    { type: "Block", value: " eslint no-console: \"off\" " },
    { type: "Block", value: " global Foo:readonly, Bar " },
    { type: "Block", value: " exported helperFn " },
    { type: "Line", value: " @ts-expect-error tipo externo" },
    { type: "Line", value: " @ts-ignore" },
    { type: "Line", value: " @ts-nocheck" },
    { type: "Line", value: " @ts-check" },
    { type: "Line", value: '/ <reference types="node" />' },
    { type: "Block", value: "#__PURE__" },
    { type: "Block", value: " @__PURE__ " },
    { type: "Block", value: "#__NO_SIDE_EFFECTS__" },
    { type: "Block", value: " @vite-ignore " },
    { type: "Block", value: ' webpackChunkName: "chunk" ' },
    { type: "Block", value: " @jsxImportSource react " },
    { type: "Block", value: " istanbul ignore next " },
    { type: "Line", value: " v8 ignore next" },
    { type: "Line", value: " c8 ignore start" },
    { type: "Line", value: " node:coverage disable" },
    { type: "Line", value: " prettier-ignore" },
    { type: "Line", value: "# sourceMappingURL=app.js.map" },
  ];

  for (const comment of allowed) {
    assert.equal(isNecessaryJsComment(comment), true, `deveria aceitar ${JSON.stringify(comment)}`);
  }

  const disallowed = [
    { type: "Line", value: " explica o que o código faz" },
    { type: "Block", value: "* JSDoc explicativo " },
    { type: "Line", value: " global state for users" },
    { type: "Block", value: " global state for users " },
    { type: "Line", value: " eslint-disable no-console" },
    { type: "Line", value: " Override default ignores of eslint-config-next." },
    { type: "Block", value: " TODO: refatorar depois " },
  ];

  for (const comment of disallowed) {
    assert.equal(isNecessaryJsComment(comment), false, `deveria rejeitar ${JSON.stringify(comment)}`);
  }
});

test("scanner de CSS ignora strings e captura comentários de bloco", () => {
  const css = [
    '.a::before { content: "/* não é comentário */"; }',
    "/* comentário comum */",
    "/* stylelint-disable-next-line color-no-hex */",
    "/*# sourceMappingURL=app.css.map */",
  ].join("\n");

  const comments = scanCssComments(css);
  assert.equal(comments.length, 3);
  assert.equal(isNecessaryComment(comments[0], "css"), false);
  assert.equal(isNecessaryComment(comments[1], "css"), true);
  assert.equal(isNecessaryComment(comments[2], "css"), true);
});

test("scanner de SQL respeita strings, identificadores, comentários aninhados e hints", () => {
  const sql = [
    "SELECT '-- literal', '/* literal */', E'it\\'s -- literal', \"col--name\";",
    "-- comentário SQL",
    "/* bloco /* aninhado */ fim */",
    "/*+ SeqScan(games) */",
    "CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$",
    "BEGIN",
    "  -- comentário dentro da função",
    "  PERFORM '-- dentro de string';",
    "END;",
    "$$;",
  ].join("\n");

  const comments = scanSqlComments(sql);
  assert.equal(comments.length, 4);
  assert.equal(isNecessaryComment(comments[0], "sql"), false);
  assert.equal(isNecessaryComment(comments[1], "sql"), false);
  assert.equal(isNecessaryComment(comments[2], "sql"), true);
  assert.equal(isNecessaryComment(comments[3], "sql"), false);
});

test("scanner de YAML distingue comentários, strings, block scalars literais e scripts em run", () => {
  const yaml = [
    "# yaml-language-server: $schema=https://example.test/schema.json",
    "# comentário YAML",
    'title: "cor #fff"',
    "notes: |",
    "  # texto literal, não comentário",
    "steps:",
    "  - run: |",
    "      # shellcheck disable=SC2086",
    "      # comentário bash em run",
    "      echo ${#arr[@]}",
  ].join("\n");

  const comments = scanYamlComments(yaml);
  assert.equal(comments.length, 4);
  assert.equal(isNecessaryComment(comments[0], comments[0].language), true);
  assert.equal(isNecessaryComment(comments[1], comments[1].language), false);
  assert.equal(isNecessaryComment(comments[2], comments[2].language), true);
  assert.equal(isNecessaryComment(comments[3], comments[3].language), false);
});

test("scanner de Shell respeita shebang, shellcheck, expansões ${#...}, quotes e heredocs", () => {
  const sh = [
    "#!/usr/bin/env bash",
    "# shellcheck disable=SC2034",
    "# comentário de shell",
    'echo "texto # não é comentário" ${#arr[@]} ${x#prefix} \\#literal',
    "cat <<'EOF'",
    "# dentro do heredoc não é comentário de shell",
    "EOF",
    "echo ok # inline",
  ].join("\n");

  const comments = scanShellComments(sh);
  assert.equal(comments.length, 4);
  assert.equal(isNecessaryComment(comments[0], "shell"), true);
  assert.equal(isNecessaryComment(comments[1], "shell"), true);
  assert.equal(isNecessaryComment(comments[2], "shell"), false);
  assert.equal(isNecessaryComment(comments[3], "shell"), false);
});

test("scanner de TLA+ captura \\* e (* ... *) fora de strings", () => {
  const tla = [
    'Msg == "\\* literal"',
    "\\* comentário de linha",
    "(* bloco (* aninhado *) *)",
  ].join("\n");

  const comments = scanTlaComments(tla);
  assert.equal(comments.length, 2);
  assert.equal(isNecessaryComment(comments[0], "tla"), false);
  assert.equal(isNecessaryComment(comments[1], "tla"), false);
});

test("ESLint rejeita comentários desnecessários ponta a ponta em TS, TSX, CSS, SQL, YAML, Shell e TLA+", async () => {
  assert.equal((await lintRuleMessages("const x = 1; // explica\n", "src/example.ts")).length, 1);
  assert.equal((await lintRuleMessages("const x = 1;\n", "src/example.ts")).length, 0);
  assert.equal((await lintRuleMessages("export const A = () => <div>{/* nota */}</div>;\n", "src/example.tsx")).length, 1);
  assert.equal((await lintRuleMessages("/* nota */\n.a { color: red; }\n", "src/example.css")).length, 1);
  assert.equal((await lintRuleMessages("-- nota\nSELECT 1;\n", "migration_example.sql")).length, 1);
  assert.equal((await lintRuleMessages("# nota\nname: ci\n", ".github/workflows/example.yml")).length, 1);
  assert.equal((await lintRuleMessages("#!/usr/bin/env bash\n# nota\necho ok\n", "scripts/example.sh")).length, 1);
  assert.equal((await lintRuleMessages("#!/usr/bin/env bash\necho ok\n", "scripts/example.sh")).length, 0);
  assert.equal((await lintRuleMessages("\\* nota\nSPECIFICATION Spec\n", "model.tla")).length, 1);
});
