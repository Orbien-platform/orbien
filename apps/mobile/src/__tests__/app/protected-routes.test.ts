// Toda rota da raiz de `src/app` tem que estar nomeada num `Stack.Protected`
// do layout raiz. O que o `Stack.Protected` não nomeia continua sempre
// montado (`useFilterScreenChildren` em expo-router só exclui os screens
// declarados) — ou seja, alcançável por deep link sem sessão.
//
// Este teste existe porque o buraco aparece sozinho: basta alguém adicionar
// um arquivo de rota e não mexer no `_layout.tsx`. Foi o que aconteceu com
// `celebracao/[id]` (MOB-08), que entrou na main em paralelo com a
// introdução do guard.
import * as fs from "fs";
import * as path from "path";

const APP_DIR = path.join(__dirname, "..", "..", "app");
const LAYOUT = path.join(APP_DIR, "_layout.tsx");

/** Nomes de rota da raiz, no formato que o expo-router usa em `Stack.Screen`. */
function rootRouteNames(): string[] {
  return fs
    .readdirSync(APP_DIR, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        // Grupo de layout (`(tabs)`) é uma rota só; diretório comum vira um
        // nome por arquivo dentro dele (`post/[id]`).
        if (entry.name.startsWith("(")) return [entry.name];
        return fs
          .readdirSync(path.join(APP_DIR, entry.name))
          .filter((file) => file !== "_layout.tsx")
          .map((file) => `${entry.name}/${file.replace(/\.tsx?$/, "")}`);
      }
      if (entry.name === "_layout.tsx") return [];
      return [entry.name.replace(/\.tsx?$/, "")];
    })
    .sort();
}

/** Nomes citados em `<Stack.Screen name="…">` dentro de cada bloco Protected. */
function guardedRouteNames(): { authenticated: string[]; anonymous: string[] } {
  const source = fs.readFileSync(LAYOUT, "utf8");
  const blocks = [...source.matchAll(/<Stack\.Protected guard=\{(.+?)\}>([\s\S]*?)<\/Stack\.Protected>/g)];

  const collect = (predicate: (guard: string) => boolean) =>
    blocks
      .filter(([, guard]) => predicate(guard))
      .flatMap(([, , body]) => [...body.matchAll(/<Stack\.Screen name="(.+?)"/g)].map((m) => m[1]))
      .sort();

  return {
    authenticated: collect((guard) => guard === "isAuthenticated"),
    anonymous: collect((guard) => guard === "!isAuthenticated"),
  };
}

describe("guarda de rotas do layout raiz", () => {
  it("toda rota de src/app está declarada em algum Stack.Protected", () => {
    const { authenticated, anonymous } = guardedRouteNames();

    expect([...authenticated, ...anonymous].sort()).toEqual(rootRouteNames());
  });

  it("só o login fica fora da guarda de sessão", () => {
    expect(guardedRouteNames().anonymous).toEqual(["login"]);
  });
});
