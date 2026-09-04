import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("junta classes e resolve conflitos do Tailwind", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("ignora valores falsy", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});
