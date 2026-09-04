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
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
        // Fase 11 — componentes e `lib/`. O único ramo que fica de fora é o
        // `if (!el) return` do `Reveal`: o `ref` está sempre preenchido
        // quando o effect roda, e forçá-lo a `null` exigiria fingir o
        // próprio React.
        "src/components/**": { statements: 99, branches: 98, functions: 100, lines: 100 },
        "src/lib/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
