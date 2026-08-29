import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { cn } from "@/lib/utils";

/**
 * Mapa do trajeto (Leaflet + tiles do OpenStreetMap, sem chave).
 *
 * Leaflet toca em `window`, então a lib e o CSS são carregados dinamicamente
 * dentro do efeito — o módulo é seguro para SSR. `geometria` é a polilinha
 * `[lat, lon]` devolvida por `calcularDistanciaEntreCeps`.
 */
export function MapaRota({
  geometria,
  className,
}: {
  geometria: [number, number][];
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<LeafletMap | null>(null);
  const rotaRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      const [{ default: L }] = await Promise.all([
        import("leaflet"),
        import("leaflet/dist/leaflet.css"),
      ]);
      if (cancelado || !elRef.current || geometria.length < 2) return;

      if (!mapaRef.current) {
        mapaRef.current = L.map(elRef.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© OpenStreetMap",
        }).addTo(mapaRef.current);
      }
      const mapa = mapaRef.current;

      rotaRef.current?.remove();
      const linha = L.polyline(geometria, { color: "#0ea5e9", weight: 4 });
      rotaRef.current = L.layerGroup([
        linha,
        L.circleMarker(geometria[0]!, {
          radius: 6,
          color: "#0ea5e9",
          fillColor: "#0ea5e9",
          fillOpacity: 1,
        }),
        L.circleMarker(geometria[geometria.length - 1]!, {
          radius: 6,
          color: "#ef4444",
          fillColor: "#ef4444",
          fillOpacity: 1,
        }),
      ]).addTo(mapa);

      mapa.fitBounds(linha.getBounds(), { padding: [24, 24] });
      mapa.invalidateSize();
      // Container que aparece com animação (dialog) só tem tamanho depois.
      setTimeout(() => {
        if (!cancelado) mapaRef.current?.invalidateSize();
      }, 200);
    })();

    return () => {
      cancelado = true;
    };
  }, [geometria]);

  useEffect(
    () => () => {
      mapaRef.current?.remove();
      mapaRef.current = null;
      rotaRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={elRef}
      className={cn(
        "h-64 w-full overflow-hidden rounded-xl border border-border bg-muted",
        className,
      )}
    />
  );
}
