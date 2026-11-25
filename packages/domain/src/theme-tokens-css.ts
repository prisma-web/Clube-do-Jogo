import { resolveThemePalette, themeColorTokens, webThemeColorProperty } from './theme-palettes';
import { DEFAULT_THEME, themes } from './themes';

/** Caminho, a partir da raiz do repositório, do CSS gerado que a web importa em globals.css. */
export const THEME_TOKENS_CSS_PATH = 'src/app/theme-tokens.generated.css';
export const THEME_TOKENS_GENERATE_COMMAND = 'npm run themes:generate';

// Gera as variáveis de cor de cada tema para a web. O tema padrão também vale para :root sem
// data-theme, como acontecia no bloco escrito à mão em globals.css.
export function renderThemeTokensCss(): string {
  const blocks = themes.map(theme => {
    const selector = theme.id === DEFAULT_THEME ? `:root,\n:root[data-theme='${theme.id}']` : `:root[data-theme='${theme.id}']`;
    const palette = resolveThemePalette(theme.id, 'web');
    const lines = [`  color-scheme: ${theme.scheme};`];
    for (const token of themeColorTokens) {
      const value = palette[token];
      if (value !== undefined) lines.push(`  ${webThemeColorProperty(token)}: ${value};`);
    }
    return `${selector} {\n${lines.join('\n')}\n}\n`;
  });
  const header = [
    '/*',
    ' * ARQUIVO GERADO. Não edite à mão.',
    ' * Fonte: packages/domain/src/theme-palettes.ts (cores) e packages/domain/src/themes.ts (color-scheme).',
    ` * Regenere com: ${THEME_TOKENS_GENERATE_COMMAND}`,
    ' */',
    '',
  ].join('\n');
  return `${header}\n${blocks.join('\n')}`;
}
