import { describe, expect, it } from "vitest";
import {
  changeMode,
  monthName,
  isValidRange,
  monthRangeOf,
  periodFor,
  periodLabel,
  shiftPeriod,
  todayKey,
} from "./period";

describe("todayKey", () => {
  it("usa o dia de Brasília, não o de UTC", () => {
    expect(todayKey(new Date("2026-11-01T02:00:00.000Z"))).toBe("2026-10-31");
  });
});

describe("monthRangeOf", () => {
  it("vai do dia 1 ao último dia do mês", () => {
    expect(monthRangeOf("2026-10-15")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthRangeOf("2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRangeOf("2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("periodFor", () => {
  it("mês, trimestre e ano que contêm o dia âncora", () => {
    expect(periodFor("month", "2026-10-15")).toEqual({ mode: "month", start: "2026-10-01", end: "2026-10-31" });
    expect(periodFor("quarter", "2026-10-15")).toEqual({ mode: "quarter", start: "2026-10-01", end: "2026-12-31" });
    expect(periodFor("quarter", "2026-08-01")).toEqual({ mode: "quarter", start: "2026-07-01", end: "2026-09-30" });
    expect(periodFor("year", "2026-10-15")).toEqual({ mode: "year", start: "2026-01-01", end: "2026-12-31" });
  });
});

describe("shiftPeriod", () => {
  it("anda por mês atravessando o ano", () => {
    const jan = periodFor("month", "2026-01-10");
    expect(shiftPeriod(jan, -1)).toEqual({ mode: "month", start: "2025-12-01", end: "2025-12-31" });
    expect(shiftPeriod(periodFor("month", "2026-12-10"), 1).start).toBe("2027-01-01");
  });

  it("anda por trimestre e por ano", () => {
    expect(shiftPeriod(periodFor("quarter", "2026-01-10"), -1)).toMatchObject({
      start: "2025-10-01",
      end: "2025-12-31",
    });
    expect(shiftPeriod(periodFor("year", "2026-05-10"), 1)).toMatchObject({
      start: "2027-01-01",
      end: "2027-12-31",
    });
  });

  it("intervalo livre desliza pela própria duração", () => {
    const p = { mode: "custom" as const, start: "2026-10-10", end: "2026-10-19" };
    expect(shiftPeriod(p, 1)).toEqual({ mode: "custom", start: "2026-10-20", end: "2026-10-29" });
    expect(shiftPeriod(p, -1)).toEqual({ mode: "custom", start: "2026-09-30", end: "2026-10-09" });
  });
});

describe("changeMode", () => {
  it("mantém o mês em que o usuário estava ao trocar de modo", () => {
    const month = periodFor("month", "2026-08-12");
    expect(changeMode(month, "quarter")).toMatchObject({ start: "2026-07-01", end: "2026-09-30" });
    expect(changeMode(month, "year")).toMatchObject({ start: "2026-01-01" });
  });

  it("com a data inicial apagada no personalizado, volta ao período de hoje em vez de quebrar", () => {
    const half = { mode: "custom" as const, start: "", end: "2026-10-19" };
    const today = todayKey();
    expect(() => changeMode(half, "month")).not.toThrow();
    expect(changeMode(half, "month")).toEqual(periodFor("month", today));
    expect(changeMode(half, "year")).toEqual(periodFor("year", today));
  });

  it("personalizado herda as datas do período atual", () => {
    expect(changeMode(periodFor("month", "2026-08-12"), "custom")).toEqual({
      mode: "custom",
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });
});

describe("periodLabel", () => {
  it("descreve cada modo", () => {
    expect(periodLabel(periodFor("month", "2026-10-15"))).toBe("outubro de 2026");
    expect(periodLabel(periodFor("quarter", "2026-10-15"))).toBe("4º trimestre de 2026");
    expect(periodLabel(periodFor("year", "2026-10-15"))).toBe("2026");
    expect(periodLabel({ mode: "custom", start: "2026-10-10", end: "2026-10-19" })).toBe(
      "10/10/2026 a 19/10/2026",
    );
  });
});

describe("isValidRange", () => {
  it("exige as duas datas, em ordem", () => {
    expect(isValidRange("2026-10-01", "2026-10-31")).toBe(true);
    expect(isValidRange("2026-10-05", "2026-10-05")).toBe(true);
    expect(isValidRange("2026-10-31", "2026-10-01")).toBe(false);
    expect(isValidRange("", "2026-10-01")).toBe(false);
  });
});

describe("monthName", () => {
  it("nomeia os 12 meses e devolve vazio fora do intervalo", () => {
    expect(monthName(0)).toBe("janeiro");
    expect(monthName(11)).toBe("dezembro");
    expect(monthName(12)).toBe("");
    expect(monthName(-1)).toBe("");
  });
});
