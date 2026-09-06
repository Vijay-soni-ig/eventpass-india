// Real, publicly documented center-point coordinates for the same 8 metros
// already listed in PRIMARY_CITIES (lib/discovery.ts) — used only to give
// the "Events Near You" homepage section a query origin when the visitor
// has picked a city but not granted browser geolocation. These are
// well-known geographic facts about the cities themselves, not per-event
// data — never used to place a marker for an actual exhibition.
export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Mumbai: { lat: 19.0760, lng: 72.8777 },
  Delhi: { lat: 28.7041, lng: 77.1025 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Surat: { lat: 21.1702, lng: 72.8311 },
  Hyderabad: { lat: 17.3850, lng: 78.4867 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Pune: { lat: 18.5204, lng: 73.8567 },
};

/** Same formula as the server's routes/public.ts haversineDistanceKm — kept
 *  in sync deliberately (not imported cross-runtime) since this is the only
 *  client-side use: labeling a server-supplied distanceKm is enough for
 *  every real card, this is only needed if a distance must be estimated
 *  before the server responds (never currently the case, kept for parity). */
export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "350 m" / "1.2 km" / "8 km" — never more precision than a visitor needs. */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export const NEARBY_RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
