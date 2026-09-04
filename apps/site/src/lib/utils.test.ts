import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("junta classes soltas", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("descarta valores falsos e aceita condicionais do clsx", () => {
    expect(cn("px-2", false && "hidden", undefined, null, { "py-1": true, "mt-4": false })).toBe(
      "px-2 py-1"
    );
  });

  it("a última classe conflitante do Tailwind vence", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-stone", "text-lg")).toBe("text-stone text-lg");
  });

  it("aceita arrays aninhados", () => {
    expect(cn(["px-2", ["py-1", "font-medium"]])).toBe("px-2 py-1 font-medium");
  });

  it("sem argumentos devolve string vazia", () => {
    expect(cn()).toBe("");
  });
});
