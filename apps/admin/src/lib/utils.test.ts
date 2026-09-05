import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("junta classes e descarta valores falsos", () => {
    expect(cn("px-2", false && "hidden", undefined, "py-1")).toBe("px-2 py-1");
  });

  it("a última classe conflitante do Tailwind vence", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("aceita objeto e array", () => {
    expect(cn({ "font-medium": true, italic: false }, ["mt-1", "mb-2"])).toBe(
      "font-medium mt-1 mb-2"
    );
  });

  it("sem argumentos devolve string vazia", () => {
    expect(cn()).toBe("");
  });
});
