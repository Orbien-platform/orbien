import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("junta classes soltas", () => {
    expect(cn("px-2", "text-sm")).toBe("px-2 text-sm");
  });

  it("ignora valores falsy e resolve condicionais do clsx", () => {
    expect(cn("px-2", false && "hidden", undefined, null, ["gap-2"])).toBe("px-2 gap-2");
  });

  it("deixa a última utilitária conflitante vencer (twMerge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-stone", "text-ink")).toBe("text-ink");
  });

  it("sem argumento devolve string vazia", () => {
    expect(cn()).toBe("");
  });
});
