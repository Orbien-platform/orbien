import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicCellsMap } from "./PublicCellsMap";

// O Leaflet é carregado por `import()` dentro do efeito — é o que mantém a
// página renderizável no servidor. O dublê registra o que o componente pede a
// ele: centro, marcadores, enquadramento e a limpeza na desmontagem.
const marker = {
  addTo: vi.fn(() => marker),
  bindTooltip: vi.fn(() => marker),
  on: vi.fn(() => marker),
};
const map = {
  setView: vi.fn(() => map),
  fitBounds: vi.fn(),
  remove: vi.fn(),
};
const tileLayer = { addTo: vi.fn() };

const L = {
  map: vi.fn(() => map),
  tileLayer: vi.fn(() => tileLayer),
  circleMarker: vi.fn(() => marker),
};

vi.mock("leaflet", () => ({ default: L }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const POINTS = [
  { id: "sg1", name: "Célula Centro", lat: -23.55, lng: -46.63 },
  { id: "sg2", name: "Célula Jardim", lat: -23.6, lng: -46.7 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PublicCellsMap", () => {
  it("desenha um marcador por célula e enquadra todas", async () => {
    render(<PublicCellsMap points={POINTS} selectedId={null} onSelect={vi.fn()} />);

    await waitFor(() => expect(L.circleMarker).toHaveBeenCalledTimes(2));
    expect(L.circleMarker).toHaveBeenCalledWith([-23.55, -46.63], expect.anything());
    expect(marker.bindTooltip).toHaveBeenCalledWith("Célula Centro");
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [-23.55, -46.63],
        [-23.6, -46.7],
      ],
      expect.objectContaining({ maxZoom: 15 }),
    );
  });

  it("usa a camada do OpenStreetMap", async () => {
    render(<PublicCellsMap points={POINTS} selectedId={null} onSelect={vi.fn()} />);

    await waitFor(() => expect(L.tileLayer).toHaveBeenCalled());
    expect(L.tileLayer.mock.calls[0][0]).toContain("tile.openstreetmap.org");
    expect(tileLayer.addTo).toHaveBeenCalledWith(map);
  });

  it("pinta o marcador selecionado e deixa os outros vazados", async () => {
    render(<PublicCellsMap points={POINTS} selectedId="sg2" onSelect={vi.fn()} />);

    await waitFor(() => expect(L.circleMarker).toHaveBeenCalledTimes(2));
    expect(L.circleMarker.mock.calls[0][1]).toMatchObject({ fillColor: "#ffffff" });
    expect(L.circleMarker.mock.calls[1][1]).toMatchObject({ fillColor: "#1b2a4a" });
  });

  it("avisa o pai quando clicam num marcador", async () => {
    const onSelect = vi.fn();
    render(<PublicCellsMap points={POINTS} selectedId={null} onSelect={onSelect} />);

    await waitFor(() => expect(marker.on).toHaveBeenCalled());
    const [, handler] = marker.on.mock.calls[0] as [string, () => void];
    handler();

    expect(onSelect).toHaveBeenCalledWith("sg1");
  });

  it("sem pontos, fica no enquadramento inicial e não chama fitBounds", async () => {
    render(<PublicCellsMap points={[]} selectedId={null} onSelect={vi.fn()} />);

    await waitFor(() => expect(map.setView).toHaveBeenCalled());
    expect(map.setView).toHaveBeenCalledWith([-23.5505199, -46.6333094], 11);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("destrói o mapa ao desmontar — senão o Leaflet segura o container", async () => {
    const { unmount } = render(
      <PublicCellsMap points={POINTS} selectedId={null} onSelect={vi.fn()} />,
    );
    await waitFor(() => expect(L.map).toHaveBeenCalled());

    unmount();

    await waitFor(() => expect(map.remove).toHaveBeenCalled());
  });

  it("não monta o mapa se desmontar antes do Leaflet chegar", async () => {
    const { unmount } = render(
      <PublicCellsMap points={POINTS} selectedId={null} onSelect={vi.fn()} />,
    );
    unmount();

    await waitFor(() => expect(L.map).not.toHaveBeenCalled());
  });

  it("expõe o mapa com rótulo acessível", () => {
    render(<PublicCellsMap points={[]} selectedId={null} onSelect={vi.fn()} className="h-40" />);
    expect(screen.getByRole("application", { name: "Mapa das células" })).toHaveClass("h-40");
  });
});
