import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAMINHOS_DA_API, estadoApi, estadoWeb, esperar, tocaApi } from "./esperar-deploy.mjs";

const st = (state, description = "") => ({ context: "Vercel – orbien-web", state, description });
const gitFake = ({ posterior = false, arquivos = [], erro = false } = {}) => ({
  ehAncestral: () => posterior,
  arquivosEntre: () => {
    if (erro) throw new Error("bad object");
    return arquivos;
  },
});

test("web: pending espera, success ok (inclusive build ignorado), failure falha", () => {
  assert.equal(estadoWeb([]).estado, "espera");
  assert.equal(estadoWeb([st("pending")]).estado, "espera");
  assert.equal(estadoWeb([st("success", "Canceled by Ignored Build Step")]).estado, "ok");
  assert.equal(estadoWeb([st("failure")]).estado, "falha");
  assert.equal(estadoWeb([st("error")]).estado, "falha");
  // status de outro projeto Vercel não conta
  assert.equal(estadoWeb([{ context: "Vercel – orbien-site", state: "success" }]).estado, "espera");
});

test("api: sem commit espera; igual ok; posterior ok", () => {
  assert.equal(estadoApi({ status: "ok" }, "abc", gitFake()).estado, "espera");
  assert.equal(estadoApi(null, "abc", gitFake()).estado, "espera");
  assert.equal(estadoApi({ commit: "abc" }, "abc", gitFake()).estado, "ok");
  assert.equal(estadoApi({ commit: "def" }, "abc", gitFake({ posterior: true })).estado, "ok");
});

test("api: commit atrás só vale se nada do buildFilter mudou", () => {
  const so_web = gitFake({ arquivos: ["apps/web/src/a.ts", "docs/CI.md"] });
  assert.equal(estadoApi({ commit: "def" }, "abc", so_web).estado, "ok");
  const com_api = gitFake({ arquivos: ["apps/web/a.ts", "apps/api/src/x.ts"] });
  assert.equal(estadoApi({ commit: "def" }, "abc", com_api).estado, "espera");
  assert.equal(estadoApi({ commit: "def" }, "abc", gitFake({ erro: true })).estado, "espera");
});

test("tocaApi segue o buildFilter", () => {
  assert.equal(tocaApi(["package-lock.json"]), true);
  assert.equal(tocaApi(["apps/api-x/a"]), false);
  assert.equal(tocaApi(["apps/web/package.json"]), false);
});

test("CAMINHOS_DA_API espelha o render.yaml", () => {
  const yaml = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");
  const bloco = yaml.split("buildFilter:")[1].split("envVars:")[0];
  const paths = [...bloco.matchAll(/^\s*-\s*(\S+)\s*$/gm)].map((m) => m[1].replace(/\*\*$/, ""));
  assert.deepEqual(paths.sort(), [...CAMINHOS_DA_API].sort());
});

function simula(respostas, prazoMs = 60_000) {
  let t = 0;
  let i = 0;
  return esperar({
    checar: async () => respostas[Math.min(i++, respostas.length - 1)],
    intervaloMs: 20_000,
    prazoMs,
    agora: () => t,
    pausa: async (ms) => {
      t += ms;
    },
  });
}
const ok = { estado: "ok", detalhe: "" };
const espera = { estado: "espera", detalhe: "construindo" };

test("esperar: sai com 0 quando os dois ficam ok", async () => {
  const r = await simula([{ web: espera, api: ok }, { web: ok, api: espera }, { web: ok, api: ok }]);
  assert.equal(r.codigo, 0);
});

test("esperar: já ok na primeira volta não dorme", async () => {
  const r = await simula([{ web: ok, api: ok }], 0);
  assert.equal(r.codigo, 0);
});

test("esperar: estourar o prazo é código 3 e nomeia quem faltou", async () => {
  const r = await simula([{ web: ok, api: espera }]);
  assert.equal(r.codigo, 3);
  assert.match(r.motivo, /api \(construindo\)/);
  assert.doesNotMatch(r.motivo, /web/);
});

test("esperar: deploy que falha encerra na hora com código 4", async () => {
  const r = await simula([{ web: { estado: "falha", detalhe: "Build failed" }, api: espera }]);
  assert.equal(r.codigo, 4);
  assert.match(r.motivo, /web falhou/);
});
