/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // O job "Unidade e cobertura" do CI roda um container Postgres em
  // paralelo (para a suíte de integração da API) na mesma máquina —
  // contenção real de CPU faz cada arquivo de teste do mobile levar até
  // ~35-40s em CI (contra <1s no total, localmente). 20000ms ainda estourou
  // em arquivos individuais (login.test.tsx, auth-provider.test.tsx em
  // rodadas diferentes) — não é teste lento por implementação, é margem
  // insuficiente para a contenção observada. 60s dá folga real sobre o pior
  // caso já visto (36s) sem mascarar uma suíte genuinamente travada.
  testTimeout: 60000,
};
