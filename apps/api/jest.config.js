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
  testTimeout: 60000,
  verbose: true,
};
