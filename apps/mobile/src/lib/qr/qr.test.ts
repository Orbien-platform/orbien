import { qrPath } from "../../components/QrCode";
import { buildCheckinPayload, parseCheckinPayload } from "./checkin-payload";
import { formatRemaining } from "./countdown";

const TOKEN = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("checkin-payload", () => {
  it("ida e volta: o QR do líder devolve o token", () => {
    expect(parseCheckinPayload(buildCheckinPayload(TOKEN))).toBe(TOKEN);
  });

  it("aceita o token puro, como o painel mostra", () => {
    expect(parseCheckinPayload(`  ${TOKEN} `)).toBe(TOKEN);
  });

  it("recusa o que não é QR de check-in", () => {
    expect(parseCheckinPayload("https://app.orbien.app/visitante/igreja/abc")).toBeNull();
    expect(parseCheckinPayload("orbien:checkin:nao-e-uuid")).toBeNull();
    expect(parseCheckinPayload("")).toBeNull();
  });
});

describe("formatRemaining", () => {
  it.each([
    [0, "0 s"],
    [-5, "0 s"],
    [45_900, "45 s"],
    [12 * 60_000 + 59_000, "12 min"],
    [60 * 60_000, "1h"],
    [3 * 3_600_000 + 5 * 60_000 + 30_000, "3h 05min"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatRemaining(ms)).toBe(text);
  });
});

describe("qrPath", () => {
  it("monta a matriz com a margem de 4 módulos de cada lado", () => {
    const { d, modules } = qrPath(buildCheckinPayload(TOKEN));
    // 51 bytes em correção M cabem na versão 4 (33 módulos), + 8 de margem.
    expect(modules).toBe(33 + 8);
    // Canto superior esquerdo do padrão de posição sempre escuro.
    expect(d.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});
