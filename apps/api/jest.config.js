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
const collectCoverageFrom = ['src/**/*.ts', '!src/main.ts', '!src/**/*.d.ts'];

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
  },

  verbose: true,
};
