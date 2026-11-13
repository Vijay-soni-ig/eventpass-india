import type { Business } from "@/types/exhibitor";

export function getExhibitorProfileCompletion(business: Business | null | undefined): number {
  if (!business) return 0;
  const requiredProfileFields = [business.companyName, business.address, business.logoUrl];
  const completed = requiredProfileFields.filter((value) => Boolean(value?.trim())).length;
  return Math.round((completed / requiredProfileFields.length) * 100);
}
