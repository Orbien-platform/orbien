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
      // Sobe por caminho a cada fase concluída; a Fase 13 troca por 100
      // global. O piso nunca desce.
      thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
    },
  },
});
