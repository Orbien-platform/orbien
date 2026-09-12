import { describe, it, expect } from "vitest";
import {
  DISPLAY_TIME_ZONE,
  civilDayKey,
  formatCivilDate,
  formatInstant,
  saoPauloCivilDay,
  saoPauloDateKey,
} from "./datetime";

// Estes testes rodam em Asia/Tokyo (vitest.config.ts). O fuso importa: as
// fixturas abaixo foram escolhidas para cair em **dias diferentes** em Tóquio
// e em São Paulo, que é a única forma de um assert provar que a formatação
// fixou o fuso em vez de herdar o da máquina.
const D_OPTS = { day: "2-digit", month: "2-digit", year: "numeric" } as const;

describe("DISPLAY_TIME_ZONE", () => {
  it("é o fuso de Brasília", () => {
    expect(DISPLAY_TIME_ZONE).toBe("America/Sao_Paulo");
  });
});

describe("formatInstant", () => {
  it("exibe o instante em Brasília, não no fuso da máquina", () => {
    // 00:00Z de 05/01 é 21h de 04/01 em São Paulo — e 09h de 05/01 em Tóquio.
    expect(formatInstant("2026-01-05T00:00:00Z", D_OPTS)).toBe("04/01/2026");
  });

  it("aceita Date além de string", () => {
    expect(formatInstant(new Date("2026-01-05T00:00:00Z"), D_OPTS)).toBe("04/01/2026");
  });

  it("inclui hora quando pedida, também em Brasília", () => {
    expect(
      formatInstant("2026-01-05T00:00:00Z", { hour: "2-digit", minute: "2-digit" }),
    ).toBe("21:00");
  });
});

describe("formatCivilDate", () => {
  it("não converte fuso — o dia gravado é o dia exibido", () => {
    // Uma data de nascimento chega como meia-noite UTC. Convertê-la para
    // São Paulo devolveria 04/01: aniversário um dia antes.
    expect(formatCivilDate("2026-01-05T00:00:00Z", D_OPTS)).toBe("05/01/2026");
  });

  it("aceita Date além de string", () => {
    expect(formatCivilDate(new Date("2026-01-05T00:00:00Z"), D_OPTS)).toBe("05/01/2026");
  });
});

describe("saoPauloDateKey", () => {
  it("devolve o dia civil de Brasília em ISO", () => {
    expect(saoPauloDateKey("2026-01-05T00:00:00Z")).toBe("2026-01-04");
    expect(saoPauloDateKey("2026-01-05T12:00:00Z")).toBe("2026-01-05");
  });

  it("aceita Date além de string", () => {
    expect(saoPauloDateKey(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-04");
  });

  it("ordena lexicograficamente, que é como o dashboard compara semanas", () => {
    expect(saoPauloDateKey("2026-01-04T12:00:00Z") < saoPauloDateKey("2026-01-05T12:00:00Z")).toBe(true);
  });
});

describe("saoPauloCivilDay", () => {
  it("carrega o dia de Brasília nos componentes UTC do Date", () => {
    const day = saoPauloCivilDay("2026-01-05T00:00:00Z");
    expect(day.toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(day.getUTCDay()).toBe(0); // 04/01/2026 é domingo
  });

  it("sobrevive a somar dias com setUTCDate", () => {
    const day = saoPauloCivilDay("2026-01-05T00:00:00Z");
    day.setUTCDate(day.getUTCDate() + 30);
    expect(civilDayKey(day)).toBe("2026-02-03");
  });
});

describe("civilDayKey", () => {
  it("devolve a chave do dia civil", () => {
    expect(civilDayKey(new Date("2026-02-03T00:00:00Z"))).toBe("2026-02-03");
  });
});
