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

// react-native-safe-area-context não tem binário nativo em Jest: sem a
// medição, o `SafeAreaProvider` real não renderiza os filhos (ele espera o
// primeiro `onLayout`), e qualquer tela que use `useSafeAreaInsets`
// (src/components/Screen.tsx, desde o STYLE-GUIDE.md §3) rende uma árvore
// vazia. O mock oficial da lib devolve insets fixos e renderiza direto.
// O mock da lib exporta o objeto em `.default` (build ESM->CJS); devolver
// o módulo cru deixaria `SafeAreaProvider` como undefined.
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default,
);
