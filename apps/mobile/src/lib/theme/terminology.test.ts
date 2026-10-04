jest.mock("./theme-provider", () => ({ useTheme: () => ({}) }));

import { DEFAULT_GROUP_TERM, resolveGroupTerm } from "./terminology";

describe("resolveGroupTerm", () => {
  it("sem termo configurado, fala em Grupo/Grupos", () => {
    expect(resolveGroupTerm(null, null)).toEqual(DEFAULT_GROUP_TERM);
  });

  it("termo pela metade cai no padrão — o par anda junto", () => {
    expect(resolveGroupTerm("célula", null)).toEqual(DEFAULT_GROUP_TERM);
    expect(resolveGroupTerm("  ", "células")).toEqual(DEFAULT_GROUP_TERM);
  });

  it("capitaliza só a primeira letra", () => {
    expect(resolveGroupTerm("célula", "células")).toEqual({ singular: "Célula", plural: "Células" });
    expect(resolveGroupTerm("PG", "PGs")).toEqual({ singular: "PG", plural: "PGs" });
  });
});
