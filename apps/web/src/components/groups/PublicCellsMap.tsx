"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface PublicCellsMapProps {
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

// Centro do mapa quando a igreja ainda não tem nenhuma célula com coordenada:
// a Praça da Sé, marco zero de São Paulo. É só o enquadramento inicial de um
// mapa vazio — assim que existe um ponto, o `fitBounds` manda.
const FALLBACK_CENTER: [number, number] = [-23.5505199, -46.6333094];

/**
 * Mapa das células públicas (PROD-13).
 *
 * O Leaflet é carregado por `import()` DENTRO do efeito, e não no topo do
 * arquivo, porque ele toca `document` já na importação — o App Router
 * pré-renderiza componentes de cliente no servidor, e um import estático
 * quebraria a página inteira antes de chegar ao navegador. O efeito só roda no
 * cliente, então o módulo só é buscado lá.
 *
 * Os marcadores são `circleMarker`, sem imagem nenhuma: o ícone padrão do
 * Leaflet aponta para PNGs por caminho relativo e some quando o bundler
 * reescreve os assets — o círculo é desenhado em SVG pelo próprio Leaflet e
 * não depende de arquivo.
 */
export function PublicCellsMap({
  points,
  selectedId,
  onSelect,
  className,
}: PublicCellsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // `onSelect` numa ref para o mapa não ser remontado a cada render do pai: o
  // efeito depende dos pontos, não da identidade da função. A escrita fica
  // no seu próprio efeito porque mexer em ref durante o render é justamente
  // o que a regra `react-hooks/refs` barra.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import("leaflet").Map | undefined;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(container, { scrollWheelZoom: false }).setView(FALLBACK_CENTER, 11);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      for (const point of points) {
        L.circleMarker([point.lat, point.lng], {
          radius: 9,
          weight: 2,
          color: "#1b2a4a",
          fillColor: point.id === selectedId ? "#1b2a4a" : "#ffffff",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip(point.name)
          .on("click", () => onSelectRef.current(point.id));
      }

      if (points.length > 0) {
        map.fitBounds(
          points.map((p) => [p.lat, p.lng] as [number, number]),
          { padding: [40, 40], maxZoom: 15 },
        );
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, selectedId]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Mapa das células"
      className={className}
    />
  );
}
