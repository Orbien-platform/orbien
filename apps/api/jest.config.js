/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        strict: true,
        skipLibCheck: true,
      },
    }],
  },
  setupFiles: ['<rootDir>/test/setup.ts'],
  // 90s: RLS tests open $transactions against Supabase pooler; under load
  // (dev server running concurrently) connection acquisition can take >60s.
  // If a test still fails at 90s it is a real security gap — investigate.
  testTimeout: 90000,
  verbose: true,
};
