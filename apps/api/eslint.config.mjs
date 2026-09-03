// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Base deliberadamente igual à que o Nest gera: `recommended` sem checagem de
// tipos. A variante `recommendedTypeChecked` exige o programa do tsc a cada
// run e é bem mais lenta — se um dia for ativada, que seja por decisão sua,
// com o custo medido no CI.
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "src/generated/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: "commonjs",
    },
    rules: {
      // O código já marca "não usado de propósito" com underscore (`_tx` nos
      // callbacks de transação do Prisma, `_depth` na recursão de grupos).
      // Isto alinha a regra à convenção existente — não muda código nenhum.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
