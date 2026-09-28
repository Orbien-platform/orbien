/**
 * @vitest-environment node
 *
 * O `ImageResponse` renderiza pelo Satori e converte para PNG pelo `sharp`.
 * Sob jsdom o `Uint8Array` do SVG vem de outro realm e o `sharp` o rejeita
 * com "Unsupported input ... of type object" — daí o ambiente node aqui.
 */
import { describe, expect, it } from "vitest";
import AppleIcon, { contentType, size } from "./apple-icon";

describe("apple-icon", () => {
  it("declara os 180px que o iOS pede para o ícone da home screen", () => {
    expect(size).toEqual({ width: 180, height: 180 });
    expect(contentType).toBe("image/png");
  });

  it("responde uma imagem PNG", async () => {
    const response = AppleIcon();

    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
