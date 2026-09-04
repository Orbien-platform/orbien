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
        // Fase 11 — componentes do site. Tudo aqui é apresentacional e
        // estático, então o teste é de renderização: o texto esperado
        // aparece e os links apontam para o href certo.
        "src/lib/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/ui/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/layout/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/contato/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/funcionalidades/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/home/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/lgpd/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/precos/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/sem-cnpj/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/sobre/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        // Fase 12 — rotas. Todos os arquivos de `src/app/` são Server
        // Components sem `async` (invocáveis como função) ou geradores de
        // metadata; `icon`/`apple-icon` devolvem `ImageResponse`.
        "src/app/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
