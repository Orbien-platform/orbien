import { describe, expect, it } from "vitest";

/**
 * Arquivo separado, de propósito: `BACKEND_URL` é resolvida uma vez, na
 * importação do módulo. Testar o ramo "API_BACKEND_URL definida" exige que
 * a variável já esteja no ambiente *antes* de qualquer import de
 * `./session` acontecer neste arquivo — inclusive o implícito de outro
 * teste que já tenha importado o módulo primeiro.
 */
process.env.API_BACKEND_URL = "https://api.orbien.com.br/api";

describe("BACKEND_URL", () => {
  it("usa API_BACKEND_URL quando definida, em vez do default local", async () => {
    const { BACKEND_URL } = await import("./session");
    expect(BACKEND_URL).toBe("https://api.orbien.com.br/api");
  });
});
