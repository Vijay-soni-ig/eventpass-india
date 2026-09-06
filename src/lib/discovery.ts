import type { Exhibition } from "@/types/exhibitor";

/**
 * Canonical, curated list of exhibition categories the product currently
 * promotes as browsable filter options — the single source for what were
 * two byte-for-byte duplicate arrays (Discover.tsx, ExhibitionListing.tsx).
 *
 * "Technology" and "Healthcare" were added alongside the original curated
 * set: both are real `category` values already on live exhibitions (see
 * GET /api/public/exhibitions), which the original list never covered —
 * clicking e.g. "Science & Tech" could never match a real exhibition
 * literally tagged "Technology" (the backend does an exact, case-insensitive
 * `equals` match, not a synonym match — server/src/routes/public.ts). This
 * is a data-driven correction of a proven gap, not an invented expansion —
 * every other entry is unchanged from the original two lists.
 */
export const EXHIBITION_CATEGORIES = [
  "Art & Culture",
  "Automotive",
  "Fashion",
  "Food & Lifestyle",
  "Healthcare",
  "History & Heritage",
  "Kids & Family",
  "Music",
  "Nature & Wildlife",
  "Photography",
  "Science & Tech",
  "Sports & Gaming",
  "Technology",
  "Trade Shows",
] as const;

/**
 * A handful of major Indian metros offered as a lightweight, static
 * navigation shortcut (e.g. the header's city menu). Deliberately NOT
 * derived from live exhibition data: the header renders on every public
 * page — including ones with no reason to fetch exhibitions at all (/about,
 * /contact, /auth) — and adding a fetch there just to populate a menu would
 * be a new, mostly-wasted network request on every page load. Values are
 * spelled to match how they actually appear in real exhibition data (e.g.
 * "Bengaluru", not "Bangalore") so that IF a matching exhibition exists the
 * link works correctly; if not, the listing page's own empty state handles
 * it honestly. Pages that already fetch exhibition data (homepage, Discover,
 * ExhibitionListing) should prefer `deriveExhibitionCities` below instead of
 * this list, since real data is available there at zero extra cost.
 */
export const PRIMARY_CITIES = ["Ahmedabad", "Mumbai", "Delhi", "Bengaluru", "Surat", "Hyderabad", "Chennai", "Pune"];

/** Case/whitespace-insensitive comparison — mirrors the backend's own
 *  `mode: "insensitive"` equals match for `city`/`category` (public.ts), so
 *  frontend comparisons never diverge from what the API actually matches. */
export function normalizeDiscoveryValue(value: string): string {
  return value.trim().toLowerCase();
}

export function discoveryValuesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeDiscoveryValue(a) === normalizeDiscoveryValue(b);
}

export interface DerivedDiscoveryValue {
  /** Real value as it appears in the data — use this for query params/links. */
  value: string;
  /** Same as `value` today; kept distinct in case display formatting ever
   *  needs to diverge from the raw stored string. */
  label: string;
  count: number;
}

/**
 * Pure derivation of real cities (with real counts) from an already-fetched
 * exhibitions array. No fetch, no React dependency — safe to call from any
 * page that already has exhibition data on hand. Whitespace-trimmed and
 * case-insensitively deduplicated (so "Bengaluru" and " bengaluru " collapse
 * to one entry, keeping whichever spelling was seen first), sorted by count
 * descending then name for a deterministic order.
 */
export function deriveExhibitionCities(exhibitions: Pick<Exhibition, "city">[]): DerivedDiscoveryValue[] {
  return deriveDistinctField(exhibitions.map((e) => e.city));
}

/** Same derivation for `category`, for a page that wants to show only
 *  categories with real live exhibitions rather than the full curated
 *  EXHIBITION_CATEGORIES browse list. */
export function deriveExhibitionCategories(exhibitions: Pick<Exhibition, "category">[]): DerivedDiscoveryValue[] {
  return deriveDistinctField(exhibitions.map((e) => e.category));
}

function deriveDistinctField(values: (string | null | undefined)[]): DerivedDiscoveryValue[] {
  const byKey = new Map<string, DerivedDiscoveryValue>();
  for (const raw of values) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const key = normalizeDiscoveryValue(trimmed);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byKey.set(key, { value: trimmed, label: trimmed, count: 1 });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
