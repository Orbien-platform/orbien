/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // Default de 5000ms estourou no CI (runner compartilhado, várias suítes
  // de teste do monorepo rodando na mesma job) em testes que passam em
  // ~1-2s localmente — vários passos de render + waitFor/act encadeados.
  // Não é teste lento por implementação: local sempre correu rápido.
  testTimeout: 20000,
};
