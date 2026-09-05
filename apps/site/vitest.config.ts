import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Runner de unidade e de componente. O Playwright (`e2e/`) é outro portão e
 * não entra na conta de cobertura — ver docs/TESTES.md, "O que conta como
 * cobertura".
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Sem excluir `e2e/`, o Vitest tenta rodar os specs do Playwright e
    // quebra no import de @playwright/test.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text-summary", "lcov"],
      // Fase 13 — fechamento. As 11 entradas por caminho saíram: com as Fases
      // 11 e 12 fechadas, `src/` inteiro está em 100%, e o `global` cobre o
      // que a lista por caminho não cobria — arquivo novo criado fora de todos
      // os caminhos listados não era cobrado por ninguém. O piso nunca desce:
      // se um arquivo novo derrubar o número, o caminho é testar o arquivo.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
