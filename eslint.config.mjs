import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
