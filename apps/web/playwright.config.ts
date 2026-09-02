import { defineConfig, devices } from "@playwright/test";

/**
 * Runner dos testes de tela. Roda contra um app já em pé (local ou produção),
 * definido por `E2E_BASE_URL` — não subimos servidor aqui, para que a mesma
 * suíte sirva para qualquer ambiente.
 *
 * `workers: 1` e `fullyParallel: false` são deliberados: os testes montam e
 * desmontam dados reais no mesmo tenant (instâncias, escalas, templates).
 * Rodar em paralelo faria um spec apagar o template que o outro reaproveita.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],

  // O free tier do Render dorme: o primeiro request pode levar 30-60s. Os
  // orçamentos abaixo são generosos de propósito — o que não existe é espera
  // fixa para sincronizar UI, que é papel dos `expect()` com auto-retry.
  timeout: 240_000,
  expect: { timeout: 30_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      // O viewport vem depois do preset: `Desktop Chrome` traz 1280×720, e as
      // asserções de layout (colisão do botão de fechar do Sheet) foram
      // calibradas em 1440×900.
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
