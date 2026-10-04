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
    // Fuso fixo, e de propósito **nem** o de Brasília **nem** UTC: o produto
    // exibe tudo em America/Sao_Paulo (src/lib/datetime.ts), e rodar o teste
    // já nesse fuso faria passar também o código que só herda o fuso da
    // máquina. Tóquio (+09, sem horário de verão) quebra esse código na
    // hora. Antes disso o CI rodava em UTC e o dev em -03, e os dois viam
    // resultados diferentes do mesmo teste.
    env: { TZ: "Asia/Tokyo" },
    setupFiles: ["./vitest.setup.ts"],
    // Sem excluir `e2e/`, o Vitest tenta rodar os specs do Playwright e
    // quebra no import de @playwright/test.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "text-summary", "lcov"],
      // Sobe por caminho a cada fase concluída; a Fase 13 troca por 100
      // global. O piso nunca desce.
      thresholds: {
        // Piso global medido em 2026-09-25: 99,4 statements / 97,02
        // branches / 99,81 functions / 99,93 lines, 115 arquivos e 1344
        // testes. Antes era 0 — só os caminhos listados abaixo eram
        // cobrados, e arquivo fora de todos eles (o ponto cego que
        // `components/repertorio/**` e o `src/platform/` da API tiveram)
        // não reprovava nada. O `global` fecha esse buraco e garante a meta
        // de 96% do app inteiro; os pisos por caminho continuam, mais
        // estritos onde já estavam. O piso nunca desce.
        statements: 99,
        branches: 97,
        functions: 99,
        lines: 99,
        // Fase 7
        "src/lib/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/hooks/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/contexts/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/proxy.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        // Fase 8
        "src/components/ui/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/layout/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/dashboard/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/providers/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        // Fase 9 — componentes de domínio do web. As frações abaixo de
        // 100% em `branches`/`statements` são guards defensivos do tipo
        // `if (!x) return` só alcançáveis chamando a função interna
        // diretamente — o botão que dispara cada uma só existe depois que
        // `x` já está preenchido, então o ramo "x ausente" nunca executa
        // pela UI real. Documentado por arquivo em cada `it()` correspondente.
        "src/components/celebrations/**": { statements: 99, branches: 95, functions: 100, lines: 100 },
        "src/components/content/**": { statements: 99, branches: 97, functions: 100, lines: 100 },
        // Piso de branches recalibrado para 97 na PROD-02: `CostCentersModal`
        // entrou com os dois mesmos guards defensivos que `CategoriesModal`
        // já tinha (`if (!confirmDeleteId) return` no `handleDelete`, e o
        // ramo `v` verdadeiro do `onOpenChange` do diálogo de exclusão) —
        // inalcançáveis pela UI real pelo mesmo motivo do comentário acima,
        // agora em dois arquivos em vez de um.
        "src/components/financial/**": { statements: 99, branches: 97, functions: 100, lines: 100 },
        "src/components/groups/**": { statements: 98, branches: 92, functions: 100, lines: 100 },
        "src/components/persons/**": { statements: 99, branches: 89, functions: 100, lines: 100 },
        // `components/repertorio/**` nasceu depois da Fase 9 e ficou fora da
        // lista — o mesmo ponto cego que `src/platform/` teve na API. Piso
        // medido em 2026-09-08, com `SongCatalogPanel` e `SongPicker`; as
        // frações que faltam são as guardas de `cancelled` do `useEffect`,
        // alcançáveis só desmontando no meio da requisição.
        "src/components/repertorio/**": { statements: 98, branches: 91, functions: 100, lines: 100 },
        "src/components/volunteers/**": { statements: 100, branches: 95, functions: 100, lines: 100 },
        // Fase 10
        "src/app/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
