// Setup global de testes, carregado após o framework (setupFilesAfterEnv em
// jest.config.js).
//
// AsyncStorage não tem binário nativo em Jest — qualquer módulo que o
// importe no escopo do arquivo (theme-provider.tsx, importado por
// AppButton/AppLink desde que a UI passou a usar useTheme()) derruba o
// require em cascata pra qualquer teste que renderize uma tela, mesmo sem
// tocar branding. Mock default aqui; um teste que precisa controlar
// getItem/setItem (ex.: theme-provider.test.tsx) continua livre para
// declarar o próprio jest.mock — o dele, mais específico, prevalece só
// naquele arquivo.
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
