import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { transferErrorMessage } from "./transfer-errors";

function apiError(status: number, data?: unknown) {
  return new AxiosError("falhou", "ERR", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });
}

describe("transferErrorMessage", () => {
  it("400 sem texto pede para conferir os IDs", () => {
    expect(transferErrorMessage(apiError(400))).toBe(
      "Dados inválidos. Confira os IDs informados."
    );
  });

  it("404 sem texto nomeia conta e congregação", () => {
    expect(transferErrorMessage(apiError(404, {}))).toBe(
      "Conta ou congregação de destino não encontrada."
    );
  });

  it("usa a mensagem da API quando vem como texto", () => {
    expect(transferErrorMessage(apiError(404, { message: "Conta 'x' não encontrada" }))).toBe(
      "Conta 'x' não encontrada"
    );
  });

  it("403 informa falta de permissão", () => {
    expect(transferErrorMessage(apiError(403))).toMatch(/não tem permissão/);
  });

  it("outros status dizem que nada foi alterado", () => {
    expect(transferErrorMessage(apiError(500))).toMatch(/Nada foi alterado/);
  });

  it("erro sem resposta é falha de conexão", () => {
    expect(transferErrorMessage(new Error("rede"))).toMatch(/falar com a API/);
  });
});
