import * as fs from "fs";
import * as path from "path";

// Operacionaliza a spec MOB-12 AC 4 e o Success Criteria correspondente:
// nenhum arquivo de código-fonte compartilhado (fora de
// app.config.js/eas.json/testes) pode conter o nome do app, o bundle id
// ou o app id do OneSignal como string literal — sempre via config
// resolvida em runtime (Constants.expoConfig.extra).
//
// Nota de implementação: `Constants.expoConfig` (expo-constants) vem vazio
// sob jest-expo (não há manifest nativo resolvido em ambiente de teste) —
// então os valores "de referência" são derivados direto de app.config.js,
// a mesma fonte da verdade que Constants leria em runtime real.

const SRC_ROOT = path.join(__dirname, "..", "..");
const APP_ROOT = path.join(__dirname, "..", "..", "..");

// Arquivos/diretórios fora do escopo desta checagem: a própria config
// dinâmica (onde os literais são o *default*, de propósito), eas.json,
// node_modules, e os próprios arquivos de teste (que precisam citar o
// literal para comparar).
const EXCLUDED_ABSOLUTE_PATHS = [
  path.join(APP_ROOT, "app.config.js"),
  path.join(APP_ROOT, "app.config.test.js"),
  path.join(APP_ROOT, "eas.json"),
];

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") return [];
      return listSourceFiles(fullPath);
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (/\.test\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (EXCLUDED_ABSOLUTE_PATHS.includes(fullPath)) return [];
    return [fullPath];
  });
}

function loadDefaultIdentity() {
  const originalEnv = { ...process.env };
  for (const key of [
    "ORBIEN_APP_NAME",
    "ORBIEN_APP_SLUG",
    "ORBIEN_APP_SCHEME",
    "ORBIEN_BUNDLE_ID",
    "ORBIEN_ONESIGNAL_APP_ID",
  ]) {
    delete process.env[key];
  }
  jest.resetModules();
  // require() de propósito: mesma razão do app.config.test.js (precisa
  // recarregar reagindo a process.env sem cache do module registry).
  const withDefaults = require(path.join(APP_ROOT, "app.config.js"));
  const resolved = withDefaults({ config: {} });
  process.env = originalEnv;
  return resolved;
}

describe("nenhum literal hardcoded de identidade fora de app.config.js/eas.json", () => {
  const identity = loadDefaultIdentity();
  const sourceFiles = listSourceFiles(SRC_ROOT);

  it("encontrou pelo menos um arquivo de código-fonte para checar (sanity check)", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  it.each([
    ["nome do app", identity.name],
    ["bundle id (iOS)", identity.ios.bundleIdentifier],
    ["package (Android)", identity.android.package],
    ["app id do OneSignal", identity.extra.oneSignalAppId],
  ])("%s ('%s') não aparece como string literal em nenhum arquivo de src/", (_label, literal) => {
    // Exige o valor entre aspas (', " ou `) — não basta aparecer em texto
    // (ex.: um comentário mencionando "app do Orbien" não é um hardcode de
    // identidade; `name: "Orbien"` ou `"Orbien"` numa tela, sim).
    const literalAsStringLiteral = new RegExp(`["'\`]${escapeRegExp(literal)}["'\`]`);

    const offenders = sourceFiles.filter((file) => {
      const content = fs.readFileSync(file, "utf8");
      return literalAsStringLiteral.test(content);
    });

    expect(offenders).toEqual([]);
  });
});
