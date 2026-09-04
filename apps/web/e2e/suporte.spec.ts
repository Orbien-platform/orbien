/**
 * Entrada da sessão de suporte — `/suporte/sessao`.
 *
 * É a única rota do `web` que recebe credencial pela URL, e ela existe porque
 * o console (`apps/admin`) vive em outra origem. O token que chega no
 * fragmento é trocado por cookie `HttpOnly` em `POST /api/session/suporte`.
 * A revisão da Fase 3 achou dois defeitos exatamente aqui, e os dois eram
 * invisíveis para teste de unidade:
 *
 *   - o marcador `support_session_tenant` só era gravado quando o link trazia
 *     `tenant_name`, então o nome de uma sessão anterior sobrevivia e a faixa
 *     anunciava a igreja errada;
 *   - o `replaceState` que apaga o token da barra de endereço rodava só no
 *     caminho de sucesso, deixando o `#access_token=…` na URL e no histórico
 *     nos ramos de erro.
 *
 * Daí este spec. Ele não usa a fixture `page` de `fixtures.ts`: aquela entrega
 * a página já autenticada como `tenant_admin`, e aqui o ponto é justamente
 * chegar sem sessão e ver o handoff criar uma.
 *
 * Precisa de credencial de `platform_support` — do seed, não é segredo:
 *   E2E_SUPPORT_EMAIL, E2E_SUPPORT_PASSWORD
 * Sem elas o spec é pulado, para não quebrar quem roda a suíte apontada para
 * um ambiente sem conta de plataforma.
 */

import { test, expect } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3000/api";
const SUPPORT_EMAIL = process.env.E2E_SUPPORT_EMAIL;
const SUPPORT_PASSWORD = process.env.E2E_SUPPORT_PASSWORD;

interface TenantRow {
  id: string;
  slug: string;
  name: string;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`POST ${path} → HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/**
 * Reproduz o que o console faz ao clicar em "Entrar no web como suporte":
 * login de plataforma sem slug, escolhe um tenant pela listagem, e pede o
 * token de impersonação.
 */
async function abrirSessaoDeSuporte(): Promise<{ token: string; tenant: TenantRow }> {
  const { access_token } = await post<{ access_token: string }>(
    "/auth/platform/login",
    { email: SUPPORT_EMAIL, password: SUPPORT_PASSWORD }
  );

  const res = await fetch(`${API_URL}/platform/tenants?limit=100`, {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`GET /platform/tenants → HTTP ${res.status}`);
  const { data } = (await res.json()) as { data: TenantRow[] };

  const tenant = data.find((t) => t.slug === process.env.E2E_TENANT) ?? data[0];
  if (!tenant) throw new Error("Nenhum tenant listado — o seed rodou?");

  const impersonado = await post<{ access_token: string }>(
    "/auth/impersonate",
    { target_tenant_id: tenant.id },
    access_token
  );

  return { token: impersonado.access_token, tenant };
}

test.describe("sessão de suporte no web", () => {
  test.skip(
    !SUPPORT_EMAIL || !SUPPORT_PASSWORD,
    "defina E2E_SUPPORT_EMAIL e E2E_SUPPORT_PASSWORD para rodar"
  );

  test("handoff válido entra, mostra a faixa e apaga o token da URL", async ({ page }) => {
    const { token, tenant } = await abrirSessaoDeSuporte();

    const fragmento = new URLSearchParams({
      access_token: token,
      tenant_name: tenant.name,
    });
    await page.goto(`/suporte/sessao#${fragmento}`);

    // O handoff termina em `location.replace("/dashboard")`.
    await expect(page).toHaveURL(/\/dashboard/);

    // A faixa é o par visível do AuditInterceptor: quem opera precisa ver, sem
    // procurar, que não está na própria conta — e em qual igreja está.
    const faixa = page.getByRole("status").filter({ hasText: "Sessão de suporte" });
    await expect(faixa).toBeVisible();
    await expect(faixa).toContainText(tenant.name);

    // O token não pode sobrar em lugar observável. `replaceState` substituiu a
    // entrada de histórico com o fragmento, então nem a URL atual nem o voltar
    // devolvem o token.
    expect(page.url()).not.toContain("access_token");
    await page.goBack();
    expect(page.url()).not.toContain("access_token");
  });

  test("handoff ilegível mostra erro, não cria sessão e limpa a URL", async ({ page }) => {
    await page.goto("/suporte/sessao#access_token=isto-nao-e-um-jwt");

    await expect(
      page.getByRole("heading", { name: "Sessão de suporte não iniciada" })
    ).toBeVisible();
    // Não `getByRole("alert")`: o Next mantém um
    // `<div role="alert" id="__next-route-announcer__">` em toda página, então
    // o papel casa com dois elementos e o strict mode do Playwright recusa.
    await expect(
      page.getByText("Token de sessão de suporte ilegível.")
    ).toBeVisible();

    // O ramo de erro também limpa o fragmento — era o segundo defeito.
    expect(page.url()).not.toContain("access_token");

    // E não deixa sessão pela metade. O token vive em cookie `HttpOnly`, fora
    // do alcance de `page.evaluate` — a verificação é no cookie jar do
    // contexto, que é onde ele estaria.
    const cookies = await page.context().cookies();
    expect(cookies.map((c) => c.name)).not.toContain("orbien_at");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("link sem token nenhum é recusado", async ({ page }) => {
    await page.goto("/suporte/sessao");

    await expect(
      page.getByText("Link de sessão de suporte inválido ou incompleto.")
    ).toBeVisible();
  });
});
