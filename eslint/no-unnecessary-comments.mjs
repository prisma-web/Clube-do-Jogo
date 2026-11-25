const JS_LINE_DIRECTIVES = [
  /^\s*eslint-disable-(next-line|line)(?=$|\s|--)/,
  /^\s*@ts-(expect-error|ignore|nocheck|check)(?=$|\s|:)/,
  /^\/\s*<(reference|amd-module|amd-dependency)\b/,
  /^\s*(c8|v8)\s+ignore\b/,
  /^\s*node:coverage\b/,
  /^\s*prettier-ignore(?=$|\s)/,
  /^\s*[#@]\s*source(Mapping)?URL=\S/,
];

const JS_BLOCK_DIRECTIVES = [
  /^\s*eslint-(disable|enable)(-next-line|-line)?(?=$|\s|--)/,
  /^\s*eslint\s+[@a-z0-9/_-]+\s*:/,
  /^\s*(globals?|exported)\s+[A-Za-z_$][A-Za-z0-9_$]*(\s*:\s*(readonly|writable|writeable|off|true|false))?(\s*,\s*[A-Za-z_$][A-Za-z0-9_$]*(\s*:\s*(readonly|writable|writeable|off|true|false))?)*\s*$/,
  /^\s*[#@]__(PURE|NO_SIDE_EFFECTS)__\s*$/,
  /^\s*@vite-ignore\s*$/,
  /^\s*(webpack|turbopack)[A-Z][A-Za-z]*\s*:/,
  /^\s*@jsx(ImportSource|Frag|Runtime)?\s+\S/,
  /^\s*(istanbul|c8|v8)\s+ignore\b/,
  /^\s*node:coverage\b/,
  /^\s*prettier-ignore(-start|-end)?(?=$|\s)/,
  /^\s*[#@]\s*source(Mapping)?URL=\S/,
];

const CSS_BLOCK_DIRECTIVES = [
  /^\s*stylelint-(disable|enable)(-next-line|-line)?(?=$|\s|--)/,
  /^\s*[#@]\s*sourceMappingURL=\S/,
  /^\s*prettier-ignore(?=$|\s)/,
];

const YAML_LINE_DIRECTIVES = [
  /^\s*yaml-language-server:\s*\S/,
  /^\s*yamllint\b/,
  /^\s*prettier-ignore(?=$|\s)/,
];

const SHELL_LINE_DIRECTIVES = [
  /^\s*shellcheck\s+\S/,
  /^\s*shfmt:\S/,
];

export function isNecessaryJsComment(comment) {
  if (comment.type === "Shebang") return true;
  if (comment.type === "Line") {
    return JS_LINE_DIRECTIVES.some((pattern) => pattern.test(comment.value));
  }
  if (comment.type === "Block") {
    return JS_BLOCK_DIRECTIVES.some((pattern) => pattern.test(comment.value));
  }
  return false;
}

export function isNecessaryComment(comment, language = "js") {
  if (language === "js") return isNecessaryJsComment(comment);
  if (language === "css") {
    return comment.type === "Block" && CSS_BLOCK_DIRECTIVES.some((pattern) => pattern.test(comment.value));
  }
  if (language === "sql") {
    return comment.type === "Block" && comment.value.startsWith("+");
  }
  if (language === "yaml") {
    return comment.type === "Line" && YAML_LINE_DIRECTIVES.some((pattern) => pattern.test(comment.value));
  }
  if (language === "shell") {
    if (comment.type === "Shebang") return true;
    return comment.type === "Line" && SHELL_LINE_DIRECTIVES.some((pattern) => pattern.test(comment.value));
  }
  return false;
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function offsetToPosition(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStarts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - lineStarts[low] };
}

function makeComment(lineStarts, language, type, value, start, end) {
  return {
    type,
    value,
    language,
    range: [start, end],
    loc: {
      start: offsetToPosition(lineStarts, start),
      end: offsetToPosition(lineStarts, end),
    },
  };
}

export function scanCssComments(text) {
  const lineStarts = buildLineStarts(text);
  const comments = [];
  let i = 0;
  let quote = "";

  while (i < text.length) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = "";
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const start = i;
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? text.length : close + 2;
      const value = text.slice(start + 2, close === -1 ? text.length : close);
      comments.push(makeComment(lineStarts, "css", "Block", value, start, end));
      i = end;
      continue;
    }
    i += 1;
  }

  return comments;
}

export function scanSqlComments(text) {
  const lineStarts = buildLineStarts(text);
  const comments = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "'") {
      const escaped = i > 0 && (text[i - 1] === "E" || text[i - 1] === "e") && (i === 1 || !/[A-Za-z0-9_$]/.test(text[i - 2]));
      i += 1;
      while (i < text.length) {
        if (escaped && text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      i += 1;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === "-" && text[i + 1] === "-") {
      const start = i;
      const nl = text.indexOf("\n", i + 2);
      const rawEnd = nl === -1 ? text.length : nl;
      const end = rawEnd > start && text[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
      comments.push(makeComment(lineStarts, "sql", "Line", text.slice(start + 2, end), start, end));
      i = rawEnd;
      continue;
    }

    if (ch === "/" && text[i + 1] === "*") {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (text[i] === "*" && text[i + 1] === "/") {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      const end = i;
      const value = depth === 0 ? text.slice(start + 2, end - 2) : text.slice(start + 2, end);
      comments.push(makeComment(lineStarts, "sql", "Block", value, start, end));
      continue;
    }

    i += 1;
  }

  return comments;
}

export function scanShellComments(text, { allowShebang = true } = {}) {
  const lineStarts = buildLineStarts(text);
  const comments = [];
  let i = 0;

  if (allowShebang && text.startsWith("#!")) {
    const nl = text.indexOf("\n");
    const rawEnd = nl === -1 ? text.length : nl;
    const end = rawEnd > 0 && text[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
    comments.push(makeComment(lineStarts, "shell", "Shebang", text.slice(2, end), 0, end));
    i = nl === -1 ? text.length : nl + 1;
  }

  const pendingHeredocs = [];

  const skipHeredocBody = (delimiter, stripTabs) => {
    while (i < text.length) {
      const nl = text.indexOf("\n", i);
      const rawEnd = nl === -1 ? text.length : nl;
      const lineEnd = rawEnd > i && text[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
      let line = text.slice(i, lineEnd);
      if (stripTabs) line = line.replace(/^\t+/, "");
      i = nl === -1 ? text.length : nl + 1;
      if (line === delimiter) return;
    }
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\n") {
      i += 1;
      while (pendingHeredocs.length > 0) {
        const next = pendingHeredocs.shift();
        skipHeredocBody(next.delimiter, next.stripTabs);
      }
      continue;
    }

    if (ch === "\\") {
      i += 2;
      continue;
    }

    if (ch === "$" && text[i + 1] === "'") {
      i += 2;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === "'") {
      i += 1;
      while (i < text.length && text[i] !== "'") i += 1;
      if (i < text.length) i += 1;
      continue;
    }

    if (ch === '"') {
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === "$" && text[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === "\\") {
          i += 2;
        } else if (text[i] === "'") {
          i += 1;
          while (i < text.length && text[i] !== "'") i += 1;
          if (i < text.length) i += 1;
        } else if (text[i] === '"') {
          i += 1;
          while (i < text.length) {
            if (text[i] === "\\") i += 2;
            else if (text[i] === '"') {
              i += 1;
              break;
            } else i += 1;
          }
        } else if (text[i] === "{") {
          depth += 1;
          i += 1;
        } else if (text[i] === "}") {
          depth -= 1;
          i += 1;
        } else {
          i += 1;
        }
      }
      continue;
    }

    if (ch === "<" && text[i + 1] === "<" && text[i + 2] !== "<") {
      let j = i + 2;
      let stripTabs = false;
      if (text[j] === "-") {
        stripTabs = true;
        j += 1;
      }
      while (j < text.length && (text[j] === " " || text[j] === "\t")) j += 1;
      let delimiter = "";
      if (text[j] === "'" || text[j] === '"') {
        const q = text[j];
        j += 1;
        const delimStart = j;
        while (j < text.length && text[j] !== q && text[j] !== "\n") j += 1;
        delimiter = text.slice(delimStart, j);
        if (text[j] === q) j += 1;
      } else {
        const delimStart = j;
        while (j < text.length && !/[\s;|&<>()]/.test(text[j])) j += 1;
        delimiter = text.slice(delimStart, j).replace(/\\/g, "");
      }
      if (delimiter.length > 0) {
        pendingHeredocs.push({ delimiter, stripTabs });
        i = j;
        continue;
      }
    }

    if (ch === "#") {
      const prev = i === 0 ? "\n" : text[i - 1];
      if (/[\s;|&({`]/.test(prev)) {
        const start = i;
        const nl = text.indexOf("\n", i + 1);
        const rawEnd = nl === -1 ? text.length : nl;
        const end = rawEnd > start && text[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
        comments.push(makeComment(lineStarts, "shell", "Line", text.slice(start + 1, end), start, end));
        i = rawEnd;
        continue;
      }
    }

    i += 1;
  }

  return comments;
}

export function scanYamlComments(text) {
  const lineStarts = buildLineStarts(text);
  const comments = [];
  const lines = text.split("\n");
  let blockScalar = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const lineStart = lineStarts[lineIndex];

    if (blockScalar) {
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;
      if (trimmed.length === 0 || indent > blockScalar.parentIndent) {
        if (blockScalar.isShell) {
          blockScalar.lines.push({ text: line, offset: lineStart });
        }
        continue;
      }
      if (blockScalar.isShell && blockScalar.lines.length > 0) {
        const shellSource = blockScalar.lines.map((entry) => entry.text).join("\n");
        const shellComments = scanShellComments(shellSource, { allowShebang: false });
        const shellLineStarts = buildLineStarts(shellSource);
        for (const sc of shellComments) {
          const entry = blockScalar.lines[sc.loc.start.line - 1];
          const start = entry.offset + (sc.range[0] - shellLineStarts[sc.loc.start.line - 1]);
          const end = start + (sc.range[1] - sc.range[0]);
          comments.push(makeComment(lineStarts, "shell", sc.type, sc.value, start, end));
        }
      }
      blockScalar = null;
    }

    let quote = "";
    let commentStartInLine = -1;
    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];
      if (quote === "'") {
        if (ch === "'") {
          if (line[j + 1] === "'") j += 1;
          else quote = "";
        }
        continue;
      }
      if (quote === '"') {
        if (ch === "\\") {
          j += 1;
          continue;
        }
        if (ch === '"') quote = "";
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        continue;
      }
      if (ch === "#" && (j === 0 || line[j - 1] === " " || line[j - 1] === "\t")) {
        commentStartInLine = j;
        break;
      }
    }

    if (commentStartInLine !== -1) {
      const start = lineStart + commentStartInLine;
      const end = lineStart + line.length;
      comments.push(makeComment(lineStarts, "yaml", "Line", line.slice(commentStartInLine + 1), start, end));
    }

    const codePart = (commentStartInLine === -1 ? line : line.slice(0, commentStartInLine)).trimEnd();
    const blockMatch = codePart.match(/^(\s*)(?:-\s+)?([^:#\s][^:#]*?)\s*:\s*([|>][+-]?\d*|\d*[|>][+-]?)\s*$/);
    if (blockMatch) {
      const parentIndent = codePart.length - codePart.trimStart().length;
      const keyName = blockMatch[2].trim();
      blockScalar = {
        parentIndent,
        isShell: keyName === "run",
        lines: [],
      };
    }
  }

  if (blockScalar && blockScalar.isShell && blockScalar.lines.length > 0) {
    const shellSource = blockScalar.lines.map((entry) => entry.text).join("\n");
    const shellComments = scanShellComments(shellSource, { allowShebang: false });
    const shellLineStarts = buildLineStarts(shellSource);
    for (const sc of shellComments) {
      const entry = blockScalar.lines[sc.loc.start.line - 1];
      const start = entry.offset + (sc.range[0] - shellLineStarts[sc.loc.start.line - 1]);
      const end = start + (sc.range[1] - sc.range[0]);
      comments.push(makeComment(lineStarts, "shell", sc.type, sc.value, start, end));
    }
  }

  return comments;
}

export function scanTlaComments(text) {
  const lineStarts = buildLineStarts(text);
  const comments = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"') {
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === "\\" && text[i + 1] === "*") {
      const start = i;
      const nl = text.indexOf("\n", i + 2);
      const rawEnd = nl === -1 ? text.length : nl;
      const end = rawEnd > start && text[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
      comments.push(makeComment(lineStarts, "tla", "Line", text.slice(start + 2, end), start, end));
      i = rawEnd;
      continue;
    }

    if (ch === "(" && text[i + 1] === "*") {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === "(" && text[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (text[i] === "*" && text[i + 1] === ")") {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      const end = i;
      const value = depth === 0 ? text.slice(start + 2, end - 2) : text.slice(start + 2, end);
      comments.push(makeComment(lineStarts, "tla", "Block", value, start, end));
      continue;
    }

    i += 1;
  }

  return comments;
}

function createCommentLanguage(languageName, scan) {
  return {
    fileType: "text",
    lineStart: 1,
    columnStart: 0,
    nodeTypeKey: "type",
    validateLanguageOptions() {},
    parse(file) {
      const text = file.body;
      const lineStarts = buildLineStarts(text);
      const comments = scan(text);
      return {
        ok: true,
        ast: {
          type: "File",
          language: languageName,
          comments,
          range: [0, text.length],
          loc: {
            start: { line: 1, column: 0 },
            end: offsetToPosition(lineStarts, text.length),
          },
        },
      };
    },
    createSourceCode(file, { ast }) {
      return {
        ast,
        text: file.body,
        getLoc(node) {
          return node.loc;
        },
        getRange(node) {
          return node.range;
        },
        getAllComments() {
          return ast.comments;
        },
        traverse() {
          return [
            { kind: 1, phase: 1, target: ast, args: [ast] },
            { kind: 1, phase: 2, target: ast, args: [ast] },
          ];
        },
      };
    },
  };
}

const noUnnecessaryCommentsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow comments that are not technically required by tooling or runtimes.",
    },
    schema: [],
    messages: {
      unnecessaryComment:
        "Comentário não tecnicamente necessário não é permitido. Remova-o ou mantenha apenas diretivas de ferramenta (eslint, @ts-*, pragmas de bundler/cobertura, shebang).",
    },
  },
  create(context) {
    const checkComments = (defaultLanguage) => {
      for (const comment of context.sourceCode.getAllComments()) {
        const language = comment.language ?? defaultLanguage;
        if (!isNecessaryComment(comment, language)) {
          context.report({
            loc: comment.loc,
            messageId: "unnecessaryComment",
          });
        }
      }
    };

    return {
      Program() {
        checkComments("js");
      },
      File(node) {
        checkComments(node.language);
      },
    };
  },
};

export const noUnnecessaryCommentsPlugin = {
  meta: {
    name: "local-comments",
    version: "1.0.0",
  },
  languages: {
    css: createCommentLanguage("css", scanCssComments),
    sql: createCommentLanguage("sql", scanSqlComments),
    yaml: createCommentLanguage("yaml", scanYamlComments),
    shell: createCommentLanguage("shell", scanShellComments),
    tla: createCommentLanguage("tla", scanTlaComments),
  },
  rules: {
    "no-unnecessary-comments": noUnnecessaryCommentsRule,
  },
};
