#!/usr/bin/env node
/**
 * Espera a produção servir o commit do merge antes de o `e2e-prod` rodar.
 *
 * Só o push para a `main` precisa disto: em PR o job já deixa de fora os specs
 * que o PR mexe. Aqui o alvo é o SHA do merge, e o job pode começar antes de a
 * Vercel e o Render terminarem de publicá-lo (PEND-25).
 *
 * Como cada plataforma diz "terminei":
 *
 *   web  A Vercel reporta ao GitHub o status `Vercel – orbien-web` no commit.
 *        `pending` = construindo; `success` = no ar — inclusive o build
 *        ignorado (turbo-ignore), que reporta success "Canceled by Ignored
 *        Build Step" quando o commit não toca o web; `failure`/`error` = o
 *        deploy quebrou (para de esperar na hora).
 *   api  O Render não reporta ao GitHub. `GET /api/health` devolve `commit`
 *        (RENDER_GIT_COMMIT). Mas o Render pula o deploy quando o commit não
 *        toca o `buildFilter` do render.yaml, então o commit servido pode
 *        legitimamente ficar para trás. Está atualizada se o commit servido é
 *        o alvo (ou descendente dele), ou se nada que o `buildFilter` observa
 *        mudou entre os dois.
 *
 * Saídas (distintas de falha de spec, que é o exit 1 do Playwright):
 *   0  produção serve o alvo     3  estourou o prazo (deploy não terminou)
 *   4  o deploy falhou na Vercel 2  uso errado (variável faltando)
 */

import { execFileSync } from "node:child_process";
import { setTimeout as dormir } from "node:timers/promises";

/** Espelho do `buildFilter.paths` do render.yaml — um teste confere os dois. */
export const CAMINHOS_DA_API = ["apps/api/", "package.json", "package-lock.json", "turbo.json"];

export const CONTEXTO_VERCEL_WEB = "Vercel – orbien-web";

export const tocaApi = (arquivos) =>
  arquivos.some((f) => CAMINHOS_DA_API.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)));

/** `statuses`: o array `statuses` de GET /repos/:r/commits/:sha/status. */
export function estadoWeb(statuses) {
  // A API devolve o mais recente por contexto; filtramos por nome exato.
  const s = statuses.find((x) => x.context === CONTEXTO_VERCEL_WEB);
  if (!s) return { estado: "espera", detalhe: "Vercel ainda não reportou o commit" };
  if (s.state === "success") return { estado: "ok", detalhe: s.description ?? "success" };
  if (s.state === "failure" || s.state === "error") {
    return { estado: "falha", detalhe: s.description ?? s.state };
  }
  return { estado: "espera", detalhe: s.description ?? s.state };
}

/**
 * `health`: corpo de /api/health (ou null se não respondeu).
 * `git`: { ehAncestral(a, b), arquivosEntre(a, b) } — injetado para teste.
 */
export function estadoApi(health, alvo, git) {
  const servido = health?.commit;
  if (!servido) return { estado: "espera", detalhe: "API ainda não informa o commit servido" };
  if (servido === alvo) return { estado: "ok", detalhe: "API serve o alvo" };
  // Produção já está à frente do alvo (outro merge entrou depois).
  if (git.ehAncestral(alvo, servido)) return { estado: "ok", detalhe: "API serve commit posterior" };
  let arquivos;
  try {
    arquivos = git.arquivosEntre(servido, alvo);
  } catch {
    return { estado: "espera", detalhe: `commit servido ${servido.slice(0, 7)} desconhecido neste clone` };
  }
  return tocaApi(arquivos)
    ? { estado: "espera", detalhe: `API serve ${servido.slice(0, 7)}; há mudança de API até o alvo` }
    : { estado: "ok", detalhe: "nada que o Render observa mudou desde o commit servido" };
}

/**
 * Repete `checar` até todos os componentes ficarem ok, algum falhar, ou o
 * prazo acabar. `checar()` devolve { web, api } com { estado, detalhe }.
 */
export async function esperar({ checar, intervaloMs, prazoMs, agora = Date.now, pausa = dormir, log = () => {} }) {
  const inicio = agora();
  let ultimo;
  for (;;) {
    ultimo = await checar();
    const partes = Object.entries(ultimo);
    log(partes.map(([k, v]) => `${k}: ${v.estado} (${v.detalhe})`).join(" | "));
    const falhou = partes.find(([, v]) => v.estado === "falha");
    if (falhou) return { codigo: 4, motivo: `deploy de ${falhou[0]} falhou: ${falhou[1].detalhe}`, ultimo };
    if (partes.every(([, v]) => v.estado === "ok")) return { codigo: 0, motivo: "produção serve o commit", ultimo };
    if (agora() - inicio + intervaloMs > prazoMs) {
      const pend = partes.filter(([, v]) => v.estado !== "ok").map(([k, v]) => `${k} (${v.detalhe})`);
      return { codigo: 3, motivo: `prazo esgotado esperando o deploy: ${pend.join(", ")}`, ultimo };
    }
    await pausa(intervaloMs);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────
const git = {
  ehAncestral(a, b) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", a, b], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  arquivosEntre(a, b) {
    return execFileSync("git", ["diff", "--name-only", a, b], { encoding: "utf8" }).split("\n").filter(Boolean);
  },
};

async function main() {
  const { SHA, GITHUB_REPOSITORY, GITHUB_TOKEN, API_HEALTH_URL } = process.env;
  const faltando = ["SHA", "GITHUB_REPOSITORY", "GITHUB_TOKEN", "API_HEALTH_URL"].filter((k) => !process.env[k]);
  if (faltando.length) {
    console.error(`::error::esperar-deploy: faltam variáveis: ${faltando.join(", ")}`);
    process.exit(2);
  }
  const prazoMs = Number(process.env.PRAZO_MIN ?? 15) * 60_000;
  const intervaloMs = Number(process.env.INTERVALO_S ?? 20) * 1000;

  const checar = async () => {
    const [web, api] = await Promise.all([
      (async () => {
        try {
          const r = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/commits/${SHA}/status`, {
            headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
          });
          if (!r.ok) return { estado: "espera", detalhe: `GitHub respondeu ${r.status}` };
          return estadoWeb((await r.json()).statuses ?? []);
        } catch (e) {
          return { estado: "espera", detalhe: `GitHub inacessível: ${e.message}` };
        }
      })(),
      (async () => {
        try {
          const r = await fetch(API_HEALTH_URL, { signal: AbortSignal.timeout(15_000) });
          // Render dormindo/reiniciando devolve 5xx: é "ainda não", não falha.
          if (!r.ok) return { estado: "espera", detalhe: `/health respondeu ${r.status}` };
          return estadoApi(await r.json(), SHA, git);
        } catch (e) {
          return { estado: "espera", detalhe: `/health inacessível: ${e.message}` };
        }
      })(),
    ]);
    return { web, api };
  };

  const r = await esperar({ checar, intervaloMs, prazoMs, log: (m) => console.log(m) });
  if (r.codigo === 0) console.log(`Produção serve ${SHA.slice(0, 7)}.`);
  else if (r.codigo === 3) {
    console.error(
      `::error title=Deploy não terminou::${r.motivo}. Não é falha de spec: a suíte nem começou. ` +
        `Confira o deploy na Vercel/Render e reexecute o job (docs/CI.md, "E2E: só no GitHub").`,
    );
  } else console.error(`::error title=Deploy falhou::${r.motivo}. A suíte não rodou.`);
  process.exit(r.codigo);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
