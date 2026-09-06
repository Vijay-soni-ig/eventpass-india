import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface VenueMapProps {
  lat: number;
  lng: number;
  label: string;
}

// A single-marker map for one real venue — no clustering plugin needed
// here (that's only useful for many markers, see NearbyMap.tsx). Same
// DivIcon approach as NearbyMap to avoid Leaflet's bundler-breaking default
// marker image paths, and the same try/catch fallback so a map init
// failure never blanks the section — the address/"View on Map" link above
// it remains usable either way.
export function VenueMap({ lat, lng, label }: VenueMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 14,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:9999px;background:hsl(160 72% 36%);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([lat, lng], { icon, keyboard: false }).addTo(map).bindTooltip(label);
      mapRef.current = map;
    } catch {
      setFailed(true);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null;

  return (
    <div
      ref={containerRef}
      className="h-48 rounded-xl border border-border overflow-hidden mt-3"
      role="img"
      aria-label={`Map showing the location of ${label}`}
    />
  );
}
