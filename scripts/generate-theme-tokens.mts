// Gera src/app/theme-tokens.generated.css a partir de packages/domain/src/theme-palettes.ts.
// Uso: npm run themes:generate
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderThemeTokensCss, THEME_TOKENS_CSS_PATH } from '../packages/domain/src/theme-tokens-css';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const target = resolve(repoRoot, THEME_TOKENS_CSS_PATH);
writeFileSync(target, renderThemeTokensCss());
console.log(`Gerado ${THEME_TOKENS_CSS_PATH}`);
