/**
 * Fixtures do `@playwright/test` para os testes de tela.
 *
 * Reúne o que antes eram `session.mjs` (sessão autenticada + coleta de erros)
 * e `fixtures.mjs` (dados de apoio). Virar fixture de verdade traz o teardown
 * garantido: o Playwright desmonta a fixture mesmo se o teste estourar no meio,
 * o que o `try/finally` dos scripts só conseguia por disciplina manual.
 *
 * Credenciais vêm do ambiente — nada de segredo no repositório:
 *   E2E_BASE_URL   (padrão http://localhost:3001, lido pelo playwright.config)
 *   E2E_API_URL    (padrão http://localhost:3000/api)
 *   E2E_EMAIL, E2E_PASSWORD, E2E_TENANT
 */

import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3000/api";

/**
 * Capturas para inspeção visual, sempre em `e2e/screenshots/` (ignorado pelo
 * git). Resolvido a partir de `__dirname` e não de `import.meta`: o runner
 * transpila os specs para CJS, onde `import.meta` não existe.
 */
export const SHOTS = path.join(__dirname, "screenshots");

export function shot(page: Page, name: string): Promise<Buffer> {
  return page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/**
 * Troca de aba e só volta quando a troca realmente aconteceu.
 *
 * A aba só responde depois da hidratação: `click()` encontra o `<button>` no
 * HTML do servidor, dispara, e o React ainda não tem handler — o clique é
 * engolido e a aba nunca muda, o que aparece adiante como "seed sem
 * instâncias" em vez de "a aba não abriu".
 *
 * `expect(...).toPass()` retenta o par clique+verificação até `aria-selected`
 * virar `true`. É auto-retry do runner, não espera fixa: assim que a aba
 * responde, segue na hora.
 */
export async function selectTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 2_000 });
  }, `aba "${name}" não respondeu ao clique`).toPass({ timeout: 60_000 });
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Tokens {
  access_token: string;
  refresh_token: string;
}

interface Identified {
  id: string;
}

interface NamedTemplate extends Identified {
  name: string;
}

interface MinistryNode extends Identified {
  children?: MinistryNode[];
}

/** Cliente HTTP autenticado contra a API, para montar e desmontar dados. */
export interface Api {
  tokens: Tokens;
  call<T>(method: string, path: string, body?: unknown): Promise<T>;
  /** Como `call`, mas ignora falha — usado só na limpeza. */
  tryCall(method: string, path: string): Promise<void>;
  /** `true` se o GET responder 2xx. 404 é resposta legítima, não erro. */
  probe(path: string): Promise<boolean>;
}

/** Recurso garantido pela fixture, com o rastro do que ela própria criou. */
export interface Ensured<T> {
  value: T;
  created: boolean;
}

/**
 * Erros observados na página. Coletamos URL e status das respostas com erro:
 * só o texto do console diz "404" sem dizer de quê, o que impede distinguir
 * 404 esperado de defeito.
 */
export interface ErrorLog {
  console: string[];
  http: string[];
}

// ─── Helpers de API ───────────────────────────────────────────────────────────

function authHeaders(token: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

/**
 * O free tier do Render dorme: o primeiro request pode levar 30-60s e, enquanto
 * o serviço acorda, responder 502/503. Reter aqui é espera por *rede*, não
 * sincronização de UI — para UI usamos os `expect()` com auto-retry.
 */
async function login(): Promise<Tokens> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const tenant_slug = process.env.E2E_TENANT;

  if (!email || !password || !tenant_slug) {
    throw new Error("Defina E2E_EMAIL, E2E_PASSWORD e E2E_TENANT no ambiente antes de rodar.");
  }

  let last = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, tenant_slug }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) return (await res.json()) as Tokens;
      last = `HTTP ${res.status} ${await res.text()}`;
      // 4xx é credencial errada — retentar não resolve.
      if (res.status < 500) break;
    } catch (err) {
      last = String(err);
    }
    await new Promise((r) => setTimeout(r, attempt * 3_000));
  }
  throw new Error(`Login falhou: ${last}`);
}

function makeApi(tokens: Tokens): Api {
  return {
    tokens,
    async call<T>(method: string, path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: authHeaders(tokens.access_token),
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        throw new Error(`${method} ${path} → HTTP ${res.status} ${await res.text()}`);
      }
      return (res.status === 204 ? null : await res.json()) as T;
    },
    async tryCall(method: string, path: string): Promise<void> {
      try {
        await fetch(`${API_URL}${path}`, {
          method,
          headers: authHeaders(tokens.access_token),
          signal: AbortSignal.timeout(90_000),
        });
      } catch {
        // Limpeza é best-effort; falhar aqui esconderia o erro real do teste.
      }
    },
    async probe(path: string): Promise<boolean> {
      const res = await fetch(`${API_URL}${path}`, {
        headers: authHeaders(tokens.access_token),
        signal: AbortSignal.timeout(90_000),
      });
      return res.ok;
    },
  };
}

/** Data ISO (YYYY-MM-DD) daqui a `days` dias. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Filtros de erro ──────────────────────────────────────────────────────────

/**
 * `GET .../schedule` responde 404 quando a instância ainda não tem escala.
 * É o estado inicial legítimo que a tela trata; não é defeito.
 */
export function unexpectedHttp(log: ErrorLog): string[] {
  return log.http.filter((e) => !/^404 .*\/schedule$/.test(e));
}

/** Ruído de ambiente que não diz nada sobre a tela sob análise. */
export function realConsoleErrors(log: ErrorLog): string[] {
  return log.console.filter(
    (e) => !/favicon|Download the React DevTools|Failed to load resource/i.test(e)
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface TestFixtures {
  errorLog: ErrorLog;
  /** Instância de celebração futura garantida (a aba "Próximas" só lista futuras). */
  upcomingInstance: Ensured<Identified>;
  /** Template de escala garantido (o seletor "Aplicar template" só existe com um). */
  scheduleTemplate: Ensured<NamedTemplate>;
  /** Nome único para o template criado pela UI, com rede de segurança na saída. */
  uiTemplateName: string;
}

interface WorkerFixtures {
  api: Api;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Uma sessão por worker: o login custa um cold start inteiro contra o Render.
  api: [
    async ({}, provide) => {
      await provide(makeApi(await login()));
    },
    { scope: "worker" },
  ],

  errorLog: async ({}, provide) => {
    await provide({ console: [], http: [] });
  },

  /**
   * Sobrescreve a `page` padrão para entregá-la já autenticada, sem passar pelo
   * formulário de login: o login é feito por HTTP contra a API e o resultado é
   * semeado direto no storage que o app usa (`src/lib/auth.ts`) — tokens em
   * localStorage e o cookie `auth_session`, que é apenas um flag lido pelo
   * proxy de SSR.
   *
   * Além de evitar digitar senha em campo de formulário, isso deixa o teste
   * focado na tela sob análise em vez de reexercitar o login a cada execução.
   *
   * Mantemos a `page` embutida (em vez de criar contexto à mão) para não perder
   * trace, vídeo e screenshot-on-failure que o runner já gerencia.
   */
  page: async ({ page, errorLog, api }, provide) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") errorLog.console.push(msg.text());
    });
    page.on("pageerror", (err) => errorLog.console.push(String(err)));
    page.on("response", (res) => {
      if (res.status() >= 400) errorLog.http.push(`${res.status()} ${res.url()}`);
    });

    // O storage precisa ser semeado com a origem do app já carregada, por isso
    // navegamos para `/login` antes — é a única rota que o proxy deixa passar
    // sem sessão.
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ([access, refresh, email]) => {
        localStorage.setItem("access_token", access);
        localStorage.setItem("refresh_token", refresh);
        localStorage.setItem("user_email", email);
        document.cookie = `auth_session=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      },
      [api.tokens.access_token, api.tokens.refresh_token, process.env.E2E_EMAIL ?? ""]
    );

    await provide(page);
  },

  /**
   * Garante uma instância de celebração no futuro. Remove **apenas** o que ela
   * própria criou: se já existia instância futura, ela é reaproveitada e a
   * instância não é removida no fim.
   *
   * A escala é tratada da mesma forma, mas por instância e não pela criação da
   * instância. Fotografamos antes quais instâncias futuras já tinham escala; no
   * teardown removemos só as escalas que *apareceram* durante o teste. Sem isso,
   * uma instância reaproveitada ficava com a escala que o teste montou — o que
   * fazia a execução seguinte encontrar "já tem escala" em vez de "Criar
   * escala", trocando de ramo e deixando resíduo no tenant.
   */
  upcomingInstance: async ({ api }, provide) => {
    const from = inDays(0);
    let upcoming = await api.call<Identified[]>(
      "GET",
      `/celebrations/instances?date_from=${from}`
    );
    let created = false;

    if (upcoming.length === 0) {
      const celebrations = await api.call<Identified[]>("GET", "/celebrations");
      if (!Array.isArray(celebrations) || celebrations.length === 0) {
        throw new Error("Nenhuma celebração cadastrada — impossível criar instância de teste.");
      }
      const instance = await api.call<Identified>("POST", "/celebrations/instances", {
        celebration_id: celebrations[0].id,
        scheduled_date: inDays(7),
        notes: "instância temporária de e2e",
      });
      upcoming = [instance];
      created = true;
    }

    const hadSchedule = new Set<string>();
    for (const i of upcoming) {
      if (await api.probe(`/celebrations/instances/${i.id}/schedule`)) hadSchedule.add(i.id);
    }

    await provide({ value: upcoming[0], created });

    for (const i of upcoming) {
      if (!hadSchedule.has(i.id)) {
        await api.tryCall("DELETE", `/celebrations/instances/${i.id}/schedule`);
      }
    }
    // A escala precisa sair antes da instância.
    if (created) {
      await api.tryCall("DELETE", `/celebrations/instances/${upcoming[0].id}`);
    }
  },

  /** Garante um template de escala. Como a instância, só remove o que criou. */
  scheduleTemplate: async ({ api }, provide) => {
    const existing = await api.call<NamedTemplate[]>("GET", "/celebrations/schedule-templates");
    if (existing.length > 0) {
      await provide({ value: existing[0], created: false });
      return;
    }

    const flat: MinistryNode[] = [];
    const walk = (nodes: MinistryNode[]): void => {
      for (const n of nodes) {
        flat.push(n);
        walk(n.children ?? []);
      }
    };
    walk(await api.call<MinistryNode[]>("GET", "/volunteers/ministries"));

    if (flat.length === 0) {
      throw new Error("Nenhum ministério cadastrado — impossível criar template de teste.");
    }

    const template = await api.call<NamedTemplate>("POST", "/celebrations/schedule-templates", {
      name: "Template temporário de e2e",
      description: "criado e removido pelo teste",
      ministries: [{ ministry_id: flat[0].id, slots: 2 }],
    });

    await provide({ value: template, created: true });

    await api.tryCall("DELETE", `/celebrations/schedule-templates/${template.id}`);
  },

  /**
   * Rede de segurança: se o teste falhar depois de criar o template pela UI,
   * o teardown da fixture ainda remove o órfão.
   */
  uiTemplateName: async ({ api }, provide) => {
    const name = `E2E template ${Date.now()}`;
    await provide(name);

    try {
      const list = await api.call<NamedTemplate[]>("GET", "/celebrations/schedule-templates");
      const orphan = list.find((t) => t.name === name);
      if (orphan) {
        await api.tryCall("DELETE", `/celebrations/schedule-templates/${orphan.id}`);
      }
    } catch {
      // Idem: limpeza não deve mascarar a falha real.
    }
  },
});

export { expect, type Page };
