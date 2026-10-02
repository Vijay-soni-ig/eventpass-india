import type { CSSProperties } from "react";
import type { PublicStallSummary } from "@/hooks/usePublicExhibitions";

// How a read-only floor plan is coloured and filtered. Shared by the public map
// and the exhibitor stall picker so both read the same way.

export type ColorMode = "status" | "price";
export type TypeFilter = "all" | "premium" | "standard" | "basic";

export interface MapView {
  mode: ColorMode;
  availableOnly: boolean;
  type: TypeFilter;
}

export const DEFAULT_VIEW: MapView = { mode: "status", availableOnly: false, type: "all" };

export const PRICE_BANDS = 5;
// Fill strength per price band, lowest to highest.
export const BAND_ALPHA = [0.12, 0.28, 0.44, 0.6, 0.76];

export interface PriceRange {
  min: number;
  max: number;
}

export function formatPrice(price: string | number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(price));
}

/** Price span of the stalls that can still be booked; null when none can. */
export function priceRange(stalls: PublicStallSummary[]): PriceRange | null {
  const prices = stalls.filter((s) => s.status === "available").map((s) => Number(s.price)).filter(Number.isFinite);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** 0 (cheapest) to PRICE_BANDS - 1 (dearest); everything is band 0 when all prices are equal. */
export function priceBand(price: number, range: PriceRange): number {
  if (range.max <= range.min) return 0;
  const ratio = (price - range.min) / (range.max - range.min);
  return Math.min(PRICE_BANDS - 1, Math.max(0, Math.floor(ratio * PRICE_BANDS)));
}

export function stallMatchesFilters(stall: PublicStallSummary, view: MapView, disabledIds?: Set<string>): boolean {
  if (view.availableOnly && (stall.status !== "available" || disabledIds?.has(stall.id))) return false;
  if (view.type !== "all" && stall.stallType !== view.type) return false;
  return true;
}

export interface PriceVisual {
  className: string;
  style?: CSSProperties;
}

/** Appearance of one stall when the map is coloured by price. */
export function priceVisual(stall: PublicStallSummary, range: PriceRange | null): PriceVisual {
  if (stall.status !== "available" || !range) return { className: "bg-muted border-border opacity-60" };
  const band = priceBand(Number(stall.price), range);
  return {
    className: "hover:brightness-95",
    style: { backgroundColor: `hsl(var(--primary) / ${BAND_ALPHA[band]})`, borderColor: "hsl(var(--primary))" },
  };
}

export function bookedPercent(stalls: PublicStallSummary[]): number {
  if (stalls.length === 0) return 0;
  return Math.round((stalls.filter((s) => s.status !== "available").length / stalls.length) * 100);
}
