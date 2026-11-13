import type { Business } from "@/types/exhibitor";

export function getExhibitorProfileCompletion(business: Pick<Business, "companyName" | "address" | "logoUrl"> | null | undefined): number {
  if (!business) return 0;
  const requiredProfileFields = [business.companyName, business.address, business.logoUrl];
  const completed = requiredProfileFields.filter((value) => Boolean(value?.trim())).length;
  return Math.round((completed / requiredProfileFields.length) * 100);
}

export function formatExhibitorCurrency(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

export function normalizeLeadCaptureStallId(stallId: string): string | undefined {
  const normalized = stallId.trim();
  return normalized && normalized !== "none" ? normalized : undefined;
}
