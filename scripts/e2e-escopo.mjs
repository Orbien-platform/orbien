#!/usr/bin/env node
/**
 * Escopo do e2e: quais specs do web (e se o smoke do site) o diff pode afetar.
 *
 * Lê da stdin a lista de arquivos alterados (um por linha) e imprime, em
 * stdout, uma linha por decisão:
 *
 *   web:*                   o diff toca algo compartilhado — rode a suíte toda
 *   web:financeiro.spec.ts  um spec afetado (uma linha por spec)
 *   site:1                  o diff toca o site — rode o smoke
 *
 * Nada impresso = nenhum spec é afetado. O motivo de cada decisão sai em
 * stderr, para o portão mostrar por que escolheu aquele escopo.
 *
 * Como o mapa é feito: sem tabela de rotas à mão. Cada spec declara de que
 * área fala — pelo nome do arquivo, pelas rotas de tela (`goto("/financeiro")`)
 * e pelas rotas de API que chama (`"/financial/transactions"`). Um arquivo
 * alterado afeta o spec se algum segmento do caminho dele (`financeiro`,
 * `financial`) for da mesma área. Spec novo entra no mapa sozinho; só o
 * dicionário de sinônimos pt/en abaixo precisa crescer quando nasce uma área
 * com nome diferente nos dois lados.
 *
 * Conservador de propósito: o que é compartilhado (lib, contexts, ui, auth,
 * seed, migrations...) vira suíte inteira. Erro para mais custa minutos; erro
 * para menos é o CI vermelho que este portão existe para evitar. Arquivo sem
 * área reconhecível não dispara spec nenhum, mas é listado no motivo.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const E2E_WEB = join(ROOT, "apps/web/e2e");

// Cada linha é uma área com seus nomes nas duas línguas. O primeiro é o
// canônico. Vale para segmento de caminho e para rota de spec.
const SINONIMOS = [
  ["celebracoes", "celebrations", "celebration", "celebracao"],
  ["voluntarios", "volunteers", "volunteer", "voluntario"],
  ["financeiro", "financial", "finance"],
  ["grupos", "groups", "small-groups", "smallgroups", "grupo"],
  ["conteudo", "content", "posts", "post"],
  ["repertorio", "songs", "song", "setlist", "setlists"],
  ["pessoas", "persons", "person", "people"],
  ["redes", "networks", "network"],
  ["suporte", "support", "platform"],
  ["dashboard"],
  ["login", "esqueci-senha", "redefinir-senha"],
];
const canonico = new Map();
for (const grupo of SINONIMOS) for (const nome of grupo) canonico.set(nome, grupo[0]);
const canon = (s) => canonico.get(s.toLowerCase()) ?? null;

// ── O que cada spec cobre ─────────────────────────────────────────────────
const specs = readdirSync(E2E_WEB).filter((f) => f.endsWith(".spec.ts"));
const areasDoSpec = new Map();
for (const spec of specs) {
  const areas = new Set();
  const nome = spec.replace(/\.spec\.ts$/, "");
  for (const parte of [nome, ...nome.split("-")]) {
    const c = canon(parte);
    if (c) areas.add(c);
  }
  const fonte = readFileSync(join(E2E_WEB, spec), "utf8");
  for (const m of fonte.matchAll(/["'`]\/([a-z][a-z-]*)/g)) {
    // `/api` e `/api-proxy` são o transporte, não a área.
    if (m[1] === "api" || m[1] === "api-proxy") continue;
    const c = canon(m[1]);
    if (c) areas.add(c);
  }
  areasDoSpec.set(spec, areas);
}

// ── Classificação dos arquivos alterados ─────────────────────────────────
const arquivos = readFileSync(0, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);

const ehTesteOuDoc = (f) =>
  /\.(test|spec)\.tsx?$/.test(f) && !f.startsWith("apps/web/e2e/") && !f.startsWith("apps/site/e2e/") ||
  /(^|\/)__tests__\//.test(f) ||
  /\.(md|mdx)$/.test(f) ||
  f.startsWith("docs/") ||
  f.startsWith(".claude/") ||
  f.startsWith("apps/api/test/");

// Mudar isso pode afetar qualquer tela — não dá para atribuir a uma área.
const COMPARTILHADO_WEB = [
  /^apps\/web\/src\/(lib|contexts|hooks)\//,
  /^apps\/web\/src\/proxy\.ts$/,
  /^apps\/web\/src\/components\/(ui|providers|layout)\//,
  /^apps\/web\/src\/app\/(layout\.tsx|globals\.css|api\/|api-proxy\/|\(admin\)\/layout\.tsx)/,
  /^apps\/web\/(package\.json|next\.config\.[a-z]+|playwright\.config\.ts|tsconfig\.json|postcss\.config\.[a-z]+)$/,
  /^apps\/web\/e2e\/(?!.*\.spec\.ts$)/, // fixtures e helpers
];
const COMPARTILHADO_API = [
  /^apps\/api\/prisma\/(schema\.prisma|seed\.ts|migrations\/)/,
  /^apps\/api\/src\/(common|auth|prisma|audit|settings|users|storage|types)\//,
  /^apps\/api\/src\/(app\.module|main)\.ts$/,
  /^apps\/api\/(package\.json|tsconfig[a-z.]*\.json|nest-cli\.json)$/,
  /^apps\/api\/scripts\/bootstrap-db\.sh$/,
];
const COMPARTILHADO_RAIZ = [/^package(-lock)?\.json$/, /^\.nvmrc$/, /^turbo\.json$/];

const motivos = [];
let tudo = false;
const afetados = new Set();
let site = false;

for (const f of arquivos) {
  if (ehTesteOuDoc(f)) continue;

  if (/^apps\/site\//.test(f) || COMPARTILHADO_RAIZ.some((r) => r.test(f))) {
    site = true;
    motivos.push(`site:1  ← ${f}`);
  }

  const m = f.match(/^apps\/web\/e2e\/([^/]+\.spec\.ts)$/);
  if (m) {
    afetados.add(m[1]);
    motivos.push(`web:${m[1]}  ← ${f} (o próprio spec mudou)`);
    continue;
  }

  const sharedWeb = COMPARTILHADO_WEB.some((r) => r.test(f));
  const sharedApi = COMPARTILHADO_API.some((r) => r.test(f));
  const sharedRaiz = COMPARTILHADO_RAIZ.some((r) => r.test(f));
  if (sharedWeb || sharedApi || sharedRaiz) {
    tudo = true;
    motivos.push(`web:*  ← ${f} (compartilhado entre telas)`);
    continue;
  }

  // Só web/src e api/src têm área; o resto (admin, mobile, site...) não passa
  // pelo e2e do web.
  if (!/^apps\/(web|api)\/src\//.test(f)) continue;

  const areas = new Set();
  for (const seg of f.split("/")) {
    const semExt = seg.replace(/\.[a-z]+$/, "");
    // `(admin)` e `[id]` não são área.
    const limpo = semExt.replace(/[()[\]]/g, "");
    for (const parte of [limpo, ...limpo.split("-"), ...limpo.split(/(?=[A-Z])/)]) {
      const c = canon(parte);
      if (c) areas.add(c);
    }
  }
  if (areas.size === 0) {
    // Sem nome de área reconhecível: nenhum spec fala disso, então não há
    // o que rodar. Fica dito no motivo, para que área nova com spec e nome
    // diferente nos dois lados (o caso do dicionário SINONIMOS) apareça aqui
    // em vez de passar calada.
    if (/^apps\/web\/src\/(app|components)\//.test(f) || /^apps\/api\/src\//.test(f)) {
      const dir = f.split("/").slice(0, 4).join("/");
      motivos.push(`(sem área reconhecida) ← ${f} [${dir}]: nenhum spec cobre`);
    }
    continue;
  }
  for (const [spec, cobertas] of areasDoSpec) {
    if ([...areas].some((a) => cobertas.has(a))) {
      if (!afetados.has(spec)) motivos.push(`web:${spec}  ← ${f} (área ${[...areas].join("/")})`);
      afetados.add(spec);
    }
  }
}

if (tudo) {
  console.log("web:*");
} else {
  for (const s of [...afetados].sort()) console.log(`web:${s}`);
}
if (site) console.log("site:1");

for (const m of motivos) console.error(`    ${m}`);
