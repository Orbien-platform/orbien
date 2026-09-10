const { transform, transformIgnorePatterns } = require("jest-expo/jest-preset");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // `lucide-react-native` (ícones do §5 do STYLE-GUIDE.md) publica só ESM
  // (`.mjs`) no campo `react-native` do package.json, que é o que o
  // resolver do jest-expo escolhe — e o preset não transforma nada fora da
  // lista dele. Sem esta linha, qualquer teste que renderize uma tela com
  // ícone morre em "Jest encountered an unexpected token".
  transformIgnorePatterns: transformIgnorePatterns.map((pattern, index) =>
    index === 0 ? pattern.replace("(?!(", "(?!(lucide-react-native|") : pattern,
  ),
  // A chave de transform do preset é `\.[jt]sx?$`, que não casa com
  // `.mjs` — sem esta entrada o arquivo entra na lista de transformáveis
  // acima e mesmo assim chega cru ao Jest. Reusa o mesmo babel-jest do
  // preset, com a mesma configuração.
  transform: {
    ...transform,
    "\\.mjs$": transform["\\.[jt]sx?$"],
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],

  // Cobertura. Sem `collectCoverageFrom`, o Jest só mede o que algum teste
  // importou — um arquivo novo sem nenhum teste ficaria fora da conta e o
  // piso abaixo não o veria. É o mesmo ponto cego que a lista de thresholds
  // por caminho teve com `src/platform/` na API (ver o cabeçalho de
  // `apps/api/jest.config.js`) e que o próprio `apps/mobile` teve por
  // inteiro entre 2026-09-08 e 2026-09-10, sem threshold nenhum.
  //
  // A meta é sobre `src/` (docs/TESTES.md, "O que conta como cobertura").
  // `app.config.js` fica fora daqui e tem teste próprio, `app.config.test.js`.
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov"],

  // Piso medido em 2026-09-10 sobre `collectCoverageFrom` acima: 94,51
  // statements / 84,69 branches / 93,81 functions / 97,94 lines, com 39
  // suítes e 239 testes. O threshold é o inteiro para baixo de cada um —
  // margem para variação de instrumentação sem afrouxar o portão. Mesmo
  // mecanismo do `apps/admin/vitest.config.ts`.
  //
  // Decisão do usuário em 2026-09-10, apresentadas as três leituras de
  // "mesma cobertura dos outros apps": piso medido, não `global: 100` como
  // api e site. Levar o mobile a 100 é trabalho próprio.
  //
  // **O piso nunca desce.** Se um arquivo novo derrubar o número, o caminho
  // é testar o arquivo — não reduzir o threshold.
  coverageThreshold: {
    global: { statements: 94, branches: 84, functions: 93, lines: 97 },
  },
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
