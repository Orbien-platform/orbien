import { addMinutesToClock, formatOffsetFromStart } from "./clock";

describe("addMinutesToClock", () => {
  it("soma e subtrai, dando a volta na meia-noite", () => {
    expect(addMinutesToClock("10:00", 25)).toBe("10:25");
    expect(addMinutesToClock("10:00", -30)).toBe("09:30");
    expect(addMinutesToClock("23:50", 20)).toBe("00:10");
    expect(addMinutesToClock("00:10", -20)).toBe("23:50");
  });
  it("devolve null para horário ausente ou inválido", () => {
    expect(addMinutesToClock(undefined, 5)).toBeNull();
    expect(addMinutesToClock(null, 5)).toBeNull();
    expect(addMinutesToClock("meio-dia", 5)).toBeNull();
  });
});

describe("formatOffsetFromStart", () => {
  it("descreve o deslocamento sem horário de início", () => {
    expect(formatOffsetFromStart(0)).toBe("0min");
    expect(formatOffsetFromStart(45)).toBe("45min");
    expect(formatOffsetFromStart(60)).toBe("1h");
    expect(formatOffsetFromStart(90)).toBe("1h30min");
    expect(formatOffsetFromStart(-30)).toBe("30min antes");
    expect(formatOffsetFromStart(-90)).toBe("1h30min antes");
  });
});
