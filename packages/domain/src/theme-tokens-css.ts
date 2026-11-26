import { resolveThemePalette, themeColorTokens, webThemeColorProperty } from './theme-palettes';
import { renderThemeShapeCss } from './theme-shapes';
import { DEFAULT_THEME, themes } from './themes';

export const THEME_TOKENS_CSS_PATH = 'src/app/theme-tokens.generated.css';
export const THEME_TOKENS_GENERATE_COMMAND = 'npm run themes:generate';

export function renderThemeTokensCss(): string {
  const blocks = themes.map(theme => {
    const selector = theme.id === DEFAULT_THEME ? `:root,\n:root[data-theme='${theme.id}']` : `:root[data-theme='${theme.id}']`;
    const palette = resolveThemePalette(theme.id, 'web');
    const lines = [`  color-scheme: ${theme.scheme};`];
    for (const token of themeColorTokens) {
      const value = palette[token];
      if (value !== undefined) lines.push(`  ${webThemeColorProperty(token)}: ${value};`);
    }
    const shapeRules = renderThemeShapeCss(theme.id);
    const shape = shapeRules.length ? `\n${shapeRules.join('\n')}\n` : '';
    return `${selector} {\n${lines.join('\n')}\n}\n${shape}`;
  });
  return blocks.join('\n');
}
