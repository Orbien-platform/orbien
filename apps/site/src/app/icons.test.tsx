import { describe, expect, it } from "vitest";
import AppleIcon, {
  contentType as appleContentType,
  size as appleSize,
} from "./apple-icon";
import Icon, { contentType as iconContentType, size as iconSize } from "./icon";

/**
 * Os dois ícones retornam `ImageResponse`, que renderiza via Satori. Comparar
 * pixel seria caro e frágil; o que importa é que a rota devolve uma resposta
 * com o tipo e o tamanho declarados — o resto é geometria comentada no
 * próprio arquivo.
 */
describe("icon", () => {
  it("declara 32×32 em PNG", () => {
    expect(iconSize).toEqual({ width: 32, height: 32 });
    expect(iconContentType).toBe("image/png");
  });

  it("responde com uma imagem", async () => {
    const resposta = Icon();

    expect(resposta).toBeInstanceOf(Response);
    expect(resposta.headers.get("content-type")).toContain("image/png");
  });
});

describe("apple-icon", () => {
  it("declara 180×180 em PNG", () => {
    expect(appleSize).toEqual({ width: 180, height: 180 });
    expect(appleContentType).toBe("image/png");
  });

  it("responde com uma imagem", async () => {
    const resposta = AppleIcon();

    expect(resposta).toBeInstanceOf(Response);
    expect(resposta.headers.get("content-type")).toContain("image/png");
  });
});
