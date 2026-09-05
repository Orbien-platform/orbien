import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke do site institucional (Fase 13 de docs/TESTES.md).
 *
 * A Fase 12 deixou uma decisão em aberto: o `playwright` órfão em
 * `devDependencies` vira o smoke, ou sai. Virou o smoke — e a dependência foi
 * trocada por `@playwright/test`, que é o pacote que traz o runner; o
 * `playwright` puro só tem a biblioteca de automação, então o órfão não daria
 * para usar como estava.
 *
 * Mesmo desenho da config do web, e pelo mesmo motivo: **não subimos servidor
 * aqui**. O alvo vem de `E2E_BASE_URL`, para que a mesma suíte sirva para o
 * dev local (`npm run dev -w orbien-site`, porta 3002), para o preview da
 * Vercel e para produção.
 *
 * Sem `workers: 1`: ao contrário do web, o site é estático — nenhum spec cria,
 * altera ou remove dado, então não há estado compartilhado para dois workers
 * corromperem.
 */
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],

  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3002",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
