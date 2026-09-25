/**
 * @vitest-environment node
 *
 * O `ImageResponse` renderiza pelo Satori e converte para PNG pelo `sharp`.
 * Sob jsdom o `Uint8Array` do SVG vem de outro realm e o `sharp` o rejeita
 * com "Unsupported input ... of type object" — daí o ambiente node aqui.
 */
import { describe, expect, it } from "vitest";
import Icon, { contentType, size } from "./icon";

describe("icon", () => {
  it("declara o tamanho e o tipo que o Next usa no <link>", () => {
    expect(size).toEqual({ width: 32, height: 32 });
    expect(contentType).toBe("image/png");
  });

  it("responde uma imagem PNG", async () => {
    const response = Icon();

    expect(response.headers.get("content-type")).toBe("image/png");
    // Só os primeiros bytes: comparar pixel dependeria da versão do Satori.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
