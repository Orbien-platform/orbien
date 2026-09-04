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
        // Fase 9 — componentes de domínio do web. As frações abaixo de
        // 100% em `branches`/`statements` são guards defensivos do tipo
        // `if (!x) return` só alcançáveis chamando a função interna
        // diretamente — o botão que dispara cada uma só existe depois que
        // `x` já está preenchido, então o ramo "x ausente" nunca executa
        // pela UI real. Documentado por arquivo em cada `it()` correspondente.
        "src/components/celebrations/**": { statements: 99, branches: 95, functions: 100, lines: 100 },
        "src/components/content/**": { statements: 99, branches: 97, functions: 100, lines: 100 },
        "src/components/financial/**": { statements: 99, branches: 98, functions: 100, lines: 100 },
        "src/components/groups/**": { statements: 98, branches: 92, functions: 100, lines: 100 },
        "src/components/persons/**": { statements: 99, branches: 89, functions: 100, lines: 100 },
        "src/components/volunteers/**": { statements: 100, branches: 95, functions: 100, lines: 100 },
      },
    },
  },
});
