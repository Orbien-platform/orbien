/**
 * Três projetos, porque as suítes têm requisitos incompatíveis:
 *
 *   unit        — src/**, Prisma mockado, sem banco. Roda em qualquer lugar.
 *   integration — test/integration/**, precisa do Postgres efêmero.
 *   rls         — test/rls/**, precisa do Postgres E de rodar em série.
 *
 * O `testMatch` anterior era só `test/**`, o que excluía `src/` — nenhum teste
 * ao lado do código seria descoberto. Ver docs/TESTES.md, Fase 0.
 */

/** @type {import('ts-jest').TsJestTransformerOptions} */
const tsJestOptions = {
  tsconfig: {
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    emitDecoratorMetadata: true,
    experimentalDecorators: true,
    strict: true,
    skipLibCheck: true,
  },
};

const transform = { '^.+\\.ts$': ['ts-jest', tsJestOptions] };

// Denominador da meta de 100%. Fica na raiz, não nos projetos: é lido do
// globalConfig. Um relatório 0/0 com testes passando normalmente significa
// que esta lista não chegou lá.
// As exclusões são curtas de propósito: *.module.ts e dto/** ficam DENTRO da
// conta. Ver docs/TESTES.md.
// `!src/**/*.spec.ts`: sem essa exclusão, rodar os projects `unit` e
// `integration` juntos (como `test:cov` faz) faz cada `*.spec.ts` de `src/`
// entrar no denominador do project `integration` — que não o reconhece como
// arquivo de teste (seu `testMatch` é só `test/integration/**`) e o injeta
// zerado. O arquivo de teste é o instrumento de medida, não o medido (ver "O
// que conta como cobertura" em docs/TESTES.md); sem a exclusão, um caminho
// 100% coberto no `unit` sozinho aparece diluído para ~30% quando os dois
// projects rodam juntos, mesmo com todo arquivo-fonte em 100%.
const collectCoverageFrom = ['src/**/*.ts', '!src/main.ts', '!src/**/*.d.ts', '!src/**/*.spec.ts'];

// ATENÇÃO: `testTimeout` dentro de um item de `projects` é IGNORADO pelo Jest 30
// (só vale o da raiz, `--testTimeout` ou `jest.setTimeout`) — o 5000 padrão
// continuava em vigor nas suítes com banco. O timeout de 90s dos projetos
// `integration` e `rls` vive em `test/setup.ts` (`jest.setTimeout`).

/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',

  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform,
      // class-transformer's `@Type()` (usado nos DTOs de paginação/data) lê
      // metadata de design-time via `Reflect.getMetadata`. Em produção isso
      // vem de `import 'reflect-metadata'` no topo de main.ts; aqui não há
      // main.ts, então o polyfill precisa ser carregado antes de qualquer DTO.
      setupFiles: ['reflect-metadata'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      transform,
      setupFiles: ['<rootDir>/test/setup.ts'],
      // Esta suíte sobe o AppModule inteiro, e o grafo alcança
      // financial/export, que importa `archiver` — ESM-only, que o Jest no
      // Node 22 não consegue `require`. Sem o stub a suíte não chega a rodar.
      // Ver o cabeçalho de test/stubs/archiver.ts.
      moduleNameMapper: { '^archiver$': '<rootDir>/test/stubs/archiver.ts' },
    },
    {
      displayName: 'rls',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/test/rls/**/*.spec.ts'],
      transform,
      setupFiles: ['<rootDir>/test/setup.ts'],
    },
  ],

  collectCoverageFrom,
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],

  // Fase 13 — fechamento. Os thresholds por caminho saíram: a meta agora é um
  // `global` em 100 nas quatro métricas, e é ele que reprova código novo sem
  // teste. Um piso por caminho, aqui, só teria como efeito deixar passar
  // arquivo fora de todos os caminhos listados — que foi exatamente o que
  // aconteceu com `src/platform/`: nasceu depois das fases 1-6, não entrou em
  // nenhuma entrada da lista, e ficou dois DTOs abaixo de 100% sem reprovar
  // nada. `global` não tem esse ponto cego.
  //
  // O piso nunca desce. Se um arquivo novo derrubar o número, o caminho é
  // testar o arquivo — não reduzir o threshold nem voltar a listar caminhos.
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },

  verbose: true,
};
