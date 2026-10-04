import { isImageUrl } from "./media";

describe("isImageUrl", () => {
  it("reconhece imagem pela extensão, com ou sem query string", () => {
    expect(isImageUrl("https://cdn/x/123-foto.JPG")).toBe(true);
    expect(isImageUrl("https://cdn/x/banner.webp?v=2")).toBe(true);
  });

  it("recusa PDF, vídeo, link cuja query parece imagem e vazio", () => {
    expect(isImageUrl("https://cdn/x/boletim.pdf")).toBe(false);
    expect(isImageUrl("https://youtube.com/watch?v=abc.png")).toBe(false);
    expect(isImageUrl(null)).toBe(false);
  });
});
