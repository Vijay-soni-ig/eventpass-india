import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

export interface NearbyMapItem {
  id: string;
  lat: number;
  lng: number;
  name: string;
  dateLabel: string;
}

interface NearbyMapProps {
  items: NearbyMapItem[];
  center: { lat: number; lng: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
  userLocation: { lat: number; lng: number } | null;
  className?: string;
}

// Leaflet's default marker image assets reference relative paths that break
// under a bundler (a well-known Leaflet+webpack/vite gotcha) — using plain
// DivIcons sidesteps that entirely and gives full control over the visual
// (brand teal, a distinct selected state) instead of a generic pin.
function markerIcon(selected: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${selected ? 20 : 14}px;
      height: ${selected ? 20 : 14}px;
      border-radius: 9999px;
      background: hsl(160 72% 36%);
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      ${selected ? "outline: 2px solid hsl(160 72% 36%); outline-offset: 2px;" : ""}
    "></div>`,
    iconSize: [selected ? 20 : 14, selected ? 20 : 14],
    iconAnchor: [selected ? 10 : 7, selected ? 10 : 7],
  });
}

function userLocationIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 16px; height: 16px; border-radius: 9999px;
      background: hsl(217 91% 60%); border: 3px solid white;
      box-shadow: 0 0 0 4px hsla(217, 91%, 60%, 0.25);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function NearbyMap({ items, center, selectedId, onSelect, userLocation, className }: NearbyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [failed, setFailed] = useState(false);

  // Initialize the map exactly once — never re-created on prop changes, per
  // the performance requirement that this section not reinitialize the map
  // for every filter/radius change.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 12,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      const cluster = L.markerClusterGroup({ maxClusterRadius: 50 });
      map.addLayer(cluster);
      mapRef.current = map;
      clusterRef.current = cluster;
    } catch {
      setFailed(true);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center the map when the query origin changes (new city/geolocation),
  // without tearing down and rebuilding the whole map instance.
  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lng], 12);
  }, [center.lat, center.lng]);

  // Rebuild only the marker layer when the result set or selection changes.
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    markersRef.current.clear();
    for (const item of items) {
      const marker = L.marker([item.lat, item.lng], { icon: markerIcon(item.id === selectedId) });
      marker.bindPopup(`<strong>${escapeHtml(item.name)}</strong><br/>${escapeHtml(item.dateLabel)}`);
      marker.on("click", () => onSelect(item.id));
      cluster.addLayer(marker);
      markersRef.current.set(item.id, marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId]);

  // Open the popup and gently pan to whichever marker is selected —
  // whether selection came from clicking the marker itself or the
  // corresponding card in the list (see NearbyEventsSection).
  useEffect(() => {
    if (!selectedId) return;
    const marker = markersRef.current.get(selectedId);
    if (marker && mapRef.current) {
      marker.openPopup();
      mapRef.current.panTo(marker.getLatLng());
    }
  }, [selectedId]);

  // "You are here" indicator — only rendered once geolocation actually
  // succeeded (never shown for a city-based fallback center).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userLocation) {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: userLocationIcon(),
        keyboard: false,
        zIndexOffset: 1000,
      })
        .bindTooltip("You are here", { permanent: false })
        .addTo(map);
    }
  }, [userLocation]);

  if (failed) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-muted rounded-2xl border border-border text-center p-6 ${className ?? ""}`}>
        <p className="font-medium">Map unavailable</p>
        <p className="text-sm text-muted-foreground">Nearby events are still available below.</p>
      </div>
    );
  }

  return <div ref={containerRef} className={`rounded-2xl border border-border overflow-hidden ${className ?? ""}`} role="group" aria-label="Map of nearby exhibitions" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
