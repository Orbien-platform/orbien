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
