import { describe, expect, it } from "vitest";
import { roleLabel } from "./roles";

describe("roleLabel", () => {
  it("traduz o código do papel para o nome legível", () => {
    expect(roleLabel("tenant_admin")).toBe("Admin do tenant");
  });

  it("devolve o próprio código quando o papel não é conhecido", () => {
    expect(roleLabel("papel_novo")).toBe("papel_novo");
  });
});
