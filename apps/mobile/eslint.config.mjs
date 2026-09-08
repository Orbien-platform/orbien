// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import expoConfig from "eslint-config-expo/flat.js";

// Mesma base que apps/api usa (typescript-eslint `recommended`, sem
// checagem de tipos — ver apps/api/eslint.config.mjs), somada ao preset
// `eslint-config-expo` para as regras específicas de RN/JSX que a base
// genérica não cobre.
export default tseslint.config(
  {
    ignores: ["node_modules/**", ".expo/**", "dist/**", "coverage/**"],
  },
  js.configs.recommended,
  // Mesmo import default que apps/api usa; `configs` vem dele mesmo.
  // eslint-disable-next-line import/no-named-as-default-member
  ...tseslint.configs.recommended,
  expoConfig,
  {
    rules: {
      // Mesma convenção do apps/api: "não usado de propósito" marcado com
      // underscore.
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
