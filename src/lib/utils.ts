import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact lakhs-style currency for headline KPIs, e.g. ₹2.8L */
export function formatCurrencyCompact(amount: number) {
  if (Math.abs(amount) >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Exact rupee amount for tables/tooltips, e.g. ₹18,500 */
export function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatPercent(value: number, digits = 1) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** Turns a raw audit-log action like "subscription.plan_changed" into "Subscription plan changed". */
export function formatActionLabel(action: string) {
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Resolves legacy local-upload URLs to the current browser origin. */
export function resolveAssetUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.pathname.startsWith("/uploads/")) {
      return url.pathname + url.search + url.hash;
    }
    return url.toString();
  } catch {
    return value;
  }
}
