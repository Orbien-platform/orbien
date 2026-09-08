import { describe, expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { apiErrorMessage } from "./api-error";

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("falhou", "ERR_BAD_RESPONSE", config, null, {
    status,
    statusText: "",
    headers: {},
    config,
    data,
  });
}

describe("apiErrorMessage", () => {
  it("usa a mensagem do servidor em erro 4xx", () => {
    expect(apiErrorMessage(axiosErrorWith(404, { message: "Música não encontrada" }), "fb")).toBe(
      "Música não encontrada"
    );
  });

  it("usa o primeiro item quando o ValidationPipe devolve array", () => {
    expect(
      apiErrorMessage(axiosErrorWith(400, { message: ["title deve ser texto", "outro"] }), "fb")
    ).toBe("title deve ser texto");
  });

  it("ignora a mensagem do servidor em 500 — não mostra 'Internal server error'", () => {
    expect(
      apiErrorMessage(
        axiosErrorWith(500, { statusCode: 500, message: "Internal server error" }),
        "Não foi possível carregar o repertório."
      )
    ).toBe("Não foi possível carregar o repertório.");
  });

  it("ignora a mensagem do servidor em 503 (migration pendente)", () => {
    expect(
      apiErrorMessage(axiosErrorWith(503, { message: "Recurso indisponível: ..." }), "fb")
    ).toBe("fb");
  });

  it("cai no fallback quando o 4xx não traz mensagem utilizável", () => {
    expect(apiErrorMessage(axiosErrorWith(403, {}), "fb")).toBe("fb");
    expect(apiErrorMessage(axiosErrorWith(403, { message: "   " }), "fb")).toBe("fb");
    expect(apiErrorMessage(axiosErrorWith(403, { message: [42] }), "fb")).toBe("fb");
    expect(apiErrorMessage(axiosErrorWith(403, null), "fb")).toBe("fb");
  });

  it("cai no fallback quando o erro não tem resposta (rede, CORS, timeout)", () => {
    expect(apiErrorMessage(new AxiosError("Network Error"), "fb")).toBe("fb");
  });

  it("confia na mensagem quando há resposta sem status numérico", () => {
    // Axios real sempre preenche `status` quando há resposta; um erro
    // construído à mão (mock de teste) pode não ter. Só 5xx desqualifica a
    // mensagem — a ausência de status não é motivo para descartá-la.
    expect(
      apiErrorMessage({ isAxiosError: true, response: { data: { message: "Link inválido." } } }, "fb")
    ).toBe("Link inválido.");
  });

  it("cai no fallback quando o erro não é do axios", () => {
    expect(apiErrorMessage(new Error("qualquer coisa"), "fb")).toBe("fb");
    expect(apiErrorMessage("string solta", "fb")).toBe("fb");
  });
});
