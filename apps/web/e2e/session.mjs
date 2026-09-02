/**
 * Cria uma sessão autenticada sem passar pelo formulário de login.
 *
 * O login é feito por HTTP contra a API e o resultado é semeado direto no
 * storage que o app usa (`src/lib/auth.ts`): os tokens em localStorage e o
 * cookie `auth_session`, que é apenas um flag lido pelo proxy de SSR.
 *
 * Além de evitar digitar senha em campo de formulário, isso deixa o teste
 * focado na tela sob análise em vez de reexercitar o login a cada execução.
 *
 * Credenciais vêm do ambiente — nada de segredo no repositório:
 *   E2E_BASE_URL   (padrão http://localhost:3001)
 *   E2E_API_URL    (padrão http://localhost:3000/api)
 *   E2E_EMAIL, E2E_PASSWORD, E2E_TENANT
 */

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:3000/api";

export async function login() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const tenant_slug = process.env.E2E_TENANT;

  if (!email || !password || !tenant_slug) {
    throw new Error(
      "Defina E2E_EMAIL, E2E_PASSWORD e E2E_TENANT no ambiente antes de rodar."
    );
  }

  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenant_slug }),
  });

  if (!res.ok) {
    throw new Error(`Login falhou: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Abre uma página já autenticada. O storage precisa ser semeado com a origem
 * do app já carregada, por isso navegamos para `/login` antes — é a única
 * rota que o proxy deixa passar sem sessão.
 */
export async function authenticatedPage(browser, tokens) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  const httpErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  // Guardamos URL e status das respostas com erro: só o texto do console diz
  // "404" sem dizer de quê, o que impede distinguir 404 esperado de defeito.
  page.on("response", (res) => {
    if (res.status() >= 400) httpErrors.push(`${res.status()} ${res.url()}`);
  });

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([access, refresh, email]) => {
      localStorage.setItem("access_token", access);
      localStorage.setItem("refresh_token", refresh);
      localStorage.setItem("user_email", email);
      document.cookie = `auth_session=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    },
    [tokens.access_token, tokens.refresh_token, process.env.E2E_EMAIL ?? ""]
  );

  return { context, page, errors, httpErrors };
}
