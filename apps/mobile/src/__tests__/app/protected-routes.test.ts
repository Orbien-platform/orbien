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
  // Recursivo: o nome de um screen é o caminho inteiro relativo ao layout
  // (`grupo/encontro/[id]/presenca`), não só o primeiro nível. Um walker
  // raso deixaria rota funda passar batido — que é justamente o furo que
  // este teste existe para pegar.
  function walk(dir: string, prefix: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Grupo de layout (`(tabs)`) é uma rota só na raiz: o `_layout.tsx`
        // dele responde por tudo que está dentro.
        if (entry.name.startsWith("(")) return [`${prefix}${entry.name}`];
        return walk(full, `${prefix}${entry.name}/`);
      }
      if (entry.name === "_layout.tsx") return [];
      return [`${prefix}${entry.name.replace(/\.tsx?$/, "")}`];
    });
  }

  return walk(APP_DIR, "").sort();
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
