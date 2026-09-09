// Formatação de data em pt-BR (src/lib/format/date.ts) — as telas passaram
// a mostrar `scheduled_date`/`occurred_at`, que antes iam pra tela cruas
// ("2026-09-13T19:00:00.000Z") ou nem apareciam.
//
// As datas são construídas com `new Date(ano, mês, dia, ...)` (hora local),
// não com string ISO em UTC: as funções leem `getDate`/`getHours`, que são
// locais, então uma string em Z faria a asserção depender do fuso da
// máquina que roda o teste.
import { formatDateTime, formatDayMonth, formatLongDate, formatMonthYear } from "./date";

function localIso(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
): string {
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

describe("formatMonthYear", () => {
  it("escreve o mês por extenso, capitalizado", () => {
    expect(formatMonthYear(9, 2026)).toBe("Setembro 2026");
    expect(formatMonthYear(10, 2026)).toBe("Outubro 2026");
    expect(formatMonthYear(3, 2027)).toBe("Março 2027");
  });

  it("mês fora de 1..12 cai no formato numérico, sem quebrar a tela", () => {
    expect(formatMonthYear(13, 2026)).toBe("13/2026");
    expect(formatMonthYear(0, 2026)).toBe("00/2026");
  });
});

describe("formatDayMonth", () => {
  it("devolve dia com dois dígitos e mês abreviado", () => {
    expect(formatDayMonth(localIso(2026, 9, 13))).toEqual({ day: "13", month: "set" });
    expect(formatDayMonth(localIso(2026, 1, 5))).toEqual({ day: "05", month: "jan" });
  });

  it("data inválida devolve null, para o componente não desenhar nada", () => {
    expect(formatDayMonth("não é data")).toBeNull();
  });
});

describe("formatDateTime", () => {
  it("inclui dia da semana, dia, mês e hora", () => {
    // 13/09/2026 é um domingo.
    expect(formatDateTime(localIso(2026, 9, 13, 19, 30))).toBe("dom, 13 set · 19:30");
  });

  it("meia-noite exata é tratada como data sem horário — não mostra 00:00", () => {
    expect(formatDateTime(localIso(2026, 9, 13))).toBe("dom, 13 set");
  });

  it("hora com minuto zero mostra o horário, porque 19:00 é informação real", () => {
    expect(formatDateTime(localIso(2026, 9, 13, 19, 0))).toBe("dom, 13 set · 19:00");
  });

  it("data inválida devolve null", () => {
    expect(formatDateTime("")).toBeNull();
  });
});

describe("formatLongDate", () => {
  it("escreve a data completa por extenso", () => {
    expect(formatLongDate(localIso(2026, 9, 13))).toBe("13 de setembro de 2026");
  });

  it("data inválida devolve null", () => {
    expect(formatLongDate("xx")).toBeNull();
  });
});
