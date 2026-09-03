/**
 * O que este teste prende é uma decisão de segurança, não um detalhe de
 * formatação: o token da sessão de suporte vai no **fragmento** da URL.
 *
 * Query string chegaria ao servidor — log de acesso da Vercel, `Referer`,
 * qualquer proxy no caminho. Fragmento não chega. A troca de `#` por `?` é uma
 * mudança de um caractere que ninguém nota em revisão, e é justamente o tipo
 * de coisa que um teste tem que segurar.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("./api", () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

const { openSupportSession } = await import("./support-session");

const TOKEN = "header.payload.signature";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  post.mockReset();
});

function stubEnv(webUrl?: string) {
  // O bundler substitui `process.env.NEXT_PUBLIC_*` em tempo de build; no
  // Vitest o acesso é em runtime, então stubar o env resolve.
  vi.stubEnv("NEXT_PUBLIC_WEB_URL", webUrl ?? "");
}

describe("openSupportSession", () => {
  it("pede o token para o tenant escolhido e abre o web numa aba nova", async () => {
    stubEnv("https://app.orbien.test");
    post.mockResolvedValue({ data: { access_token: TOKEN, expires_in: 900 } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await openSupportSession("tenant-42", "Igreja Nova");

    expect(post).toHaveBeenCalledWith("/auth/impersonate", {
      target_tenant_id: "tenant-42",
    });

    const [url, target, features] = open.mock.calls[0]!;
    expect(target).toBe("_blank");
    expect(features).toContain("noopener");
    expect(String(url).startsWith("https://app.orbien.test/suporte/sessao#")).toBe(
      true
    );
  });

  it("o token vai no fragmento, nunca na query", async () => {
    stubEnv("https://app.orbien.test");
    post.mockResolvedValue({ data: { access_token: TOKEN, expires_in: 900 } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await openSupportSession("tenant-42", "Igreja Nova");

    const url = new URL(String(open.mock.calls[0]![0]));
    expect(url.search).toBe("");
    expect(url.searchParams.get("access_token")).toBeNull();

    const fragment = new URLSearchParams(url.hash.slice(1));
    expect(fragment.get("access_token")).toBe(TOKEN);
    expect(fragment.get("tenant_name")).toBe("Igreja Nova");
  });

  it("sem NEXT_PUBLIC_WEB_URL falha alto, em vez de abrir aba em branco", async () => {
    stubEnv(undefined);
    post.mockResolvedValue({ data: { access_token: TOKEN, expires_in: 900 } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await expect(openSupportSession("tenant-42", "Igreja Nova")).rejects.toThrow(
      /NEXT_PUBLIC_WEB_URL/
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("erro do impersonate propaga — a tela precisa poder mostrar o motivo", async () => {
    stubEnv("https://app.orbien.test");
    post.mockRejectedValue(new Error("404"));
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await expect(openSupportSession("tenant-42", "Igreja Nova")).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
});
