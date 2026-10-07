/**
 * eslint-config-next 15.5 ponúka len klasické `.eslintrc` konfigurácie,
 * preto ich načítavame cez FlatCompat z @eslint/eslintrc.
 *
 * Ak balík ešte nie je nainštalovaný (`pnpm install`), konfigurácia sa
 * nerozbije — ESLint aj `next build` prejdú, len bez pravidiel Nextu.
 */
const config = [
  // next-env.d.ts generuje Next pri každom builde, nemá zmysel ho kontrolovať.
  { ignores: [".next/**", "node_modules/**", "data/**", "next-env.d.ts"] },
];

try {
  const { FlatCompat } = await import("@eslint/eslintrc");
  const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

  config.push(
    ...compat.extends("next/core-web-vitals", "next/typescript"),
    {
      rules: {
        // Nepoužité premenné z destrukturovania označujeme podčiarkovníkom.
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
        ],
      },
    },
  );
} catch {
  console.warn("[eslint] @eslint/eslintrc chýba — spusti `pnpm install`. Pravidlá Nextu sú preskočené.");
}

export default config;
