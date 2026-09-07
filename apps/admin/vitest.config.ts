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
      // Fase 14 — o console inteiro. Linhas e funções fecham em 100%; os
      // ramos que sobram são inalcançáveis pela UI e cada um tem o `it()`
      // vizinho explicando:
      // - `CreateTenantModal`, o `next === true` do `onOpenChange`: quem abre
      //   o modal é a tela, o `Modal` só emite `false`;
      // - `waitlist/page.tsx`, o mesmo `next === true` do `onOpenChange` do
      //   `CreateTenantModal` visto do lado de quem o chama — pela mesma
      //   razão, esse handler nunca recebe `true`;
      // - `AuthContext.buildUser`, o `payload` nulo: `hasPlatformRole` já
      //   barrou o token ilegível antes;
      // - `api.ts`, o `typeof window === "undefined"` do ramo de refresh
      //   recusado: exercitá-lo exigiria o axios sem `window`, que ele
      //   próprio precisa para rodar.
      thresholds: {
        statements: 99,
        branches: 98,
        functions: 100,
        lines: 100,
      },
    },
  },
});
