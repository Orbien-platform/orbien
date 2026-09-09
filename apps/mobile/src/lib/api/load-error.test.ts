// O app dizia "Verifique sua conexão" para qualquer falha de carregamento —
// inclusive com o aparelho online e o erro vindo do servidor. Estes testes
// fixam a distinção.
import { HttpError, NetworkError } from "./errors";
import { describeLoadError } from "./load-error";

describe("describeLoadError", () => {
  it("sem resposta do servidor: fala de conexão", () => {
    const state = describeLoadError(new NetworkError(), "sua escala");

    expect(state.offline).toBe(true);
    expect(state.message).toBe("Não foi possível carregar sua escala. Verifique sua conexão.");
  });

  it("servidor respondeu com erro: NÃO fala de conexão", () => {
    const state = describeLoadError(new HttpError(500, undefined), "sua escala");

    expect(state.offline).toBe(false);
    expect(state.message).toBe("Não foi possível carregar sua escala.");
    expect(state.message).not.toContain("conexão");
    expect(state.description).not.toContain("conexão");
  });

  it("erro desconhecido cai no caso do servidor, não no de rede", () => {
    // Um bug de JS na tela não é falta de internet — mandar o usuário
    // conferir o wifi seria informação errada.
    expect(describeLoadError(new TypeError("undefined is not a function"), "o conteúdo").offline).toBe(
      false,
    );
  });
});
