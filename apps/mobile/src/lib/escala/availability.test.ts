import { formatWeeklyAvailability, joinPt } from "./availability";

describe("formatWeeklyAvailability", () => {
  it("lista os dias na ordem da semana, com os turnos marcados", () => {
    expect(
      formatWeeklyAvailability({
        wednesday: ["evening"],
        sunday: ["evening", "morning"],
        saturday: ["morning", "afternoon", "evening"],
      }),
    ).toBe("Dom manhã e noite, Qua noite, Sáb manhã, tarde e noite");
  });

  it("dia sem turno, turno desconhecido ou valor fora do formato não entram", () => {
    expect(
      formatWeeklyAvailability({
        monday: [],
        tuesday: ["madrugada"],
        friday: "morning" as unknown as string[],
      }),
    ).toBeNull();
  });

  it("perfil sem disponibilidade: null", () => {
    expect(formatWeeklyAvailability({})).toBeNull();
  });
});

describe("joinPt", () => {
  it.each([
    [[], ""],
    [["a"], "a"],
    [["a", "b"], "a e b"],
    [["a", "b", "c"], "a, b e c"],
  ])("%j → %s", (items, expected) => {
    expect(joinPt(items)).toBe(expected);
  });
});
