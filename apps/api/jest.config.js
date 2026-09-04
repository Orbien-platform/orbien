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

// 90s: as suítes com banco abrem $transaction contra o pooler do Supabase;
// sob carga (dev server rodando junto) adquirir conexão pode passar de 60s.
// Se um teste ainda falhar em 90s é gap real — investigue, não aumente.
const DB_TIMEOUT = 90000;

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
      testTimeout: DB_TIMEOUT,
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
      testTimeout: DB_TIMEOUT,
    },
  ],

  collectCoverageFrom,
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],

  // Sobe por caminho a cada fase concluída; a Fase 13 troca tudo por um
  // global em 100. O piso nunca desce.
  coverageThreshold: {
    global: { statements: 0, branches: 0, functions: 0, lines: 0 },
    // Fase 1 (financeiro) segue parcial — ver docs/TESTES.md — então não
    // trava threshold por caminho lá ainda; travar agora colidiria com o WIP
    // em andamento nos achados #1 e #3 (ver docs/PENDENCIAS.md).
    './src/prisma/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/auth/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/app.controller.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/app.module.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/persons/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/visitor/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/waitlist/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/celebrations/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/volunteers/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/small-groups/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    // Fase 6 (conteúdo e apoio). NÃO virou `global: 100` ainda porque
    // `./src/financial/` (Fase 1) e `./src/common/` seguem parciais — só 4
    // dos 35 arquivos de financial têm spec. Ver docs/TESTES.md, Fase 6, e o
    // relatório desta sessão: travar `global` agora quebraria `test:cov` por
    // um motivo alheio a esta fase.
    './src/content/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/settings/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/study-materials/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/mail/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/storage/': { statements: 100, branches: 100, functions: 100, lines: 100 },
  },

  verbose: true,
};
