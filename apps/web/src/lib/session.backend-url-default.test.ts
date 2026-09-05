import { describe, expect, it } from "vitest";

/**
 * Arquivo separado, pelo mesmo motivo de `session.backend-url.test.ts`:
 * `BACKEND_URL` é resolvida uma vez, na importação do módulo. Este arquivo
 * cobre o ramo oposto — sem `API_BACKEND_URL` no ambiente — então precisa
 * apagar a variável *antes* de qualquer import de `./session`, inclusive o
 * implícito de outro teste que já tenha importado o módulo primeiro.
 */
delete process.env.API_BACKEND_URL;

describe("BACKEND_URL", () => {
  it("usa o default local quando API_BACKEND_URL não está definida", async () => {
    const { BACKEND_URL } = await import("./session");
    expect(BACKEND_URL).toBe("http://localhost:3000/api");
  });
});
