import type { Exhibition, KycStatus } from "./exhibitor";

export type DiscoverType = "events" | "organizers";

export interface OrganizerSearchResult {
  id: string;
  slug: string | null;
  name: string;
  logoUrl: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  kycStatus: KycStatus;
  createdAt: string;
  _count: { follows: number; exhibitions: number };
}

export interface DiscoverEventsResponse {
  type: "events";
  items: Exhibition[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DiscoverOrganizersResponse {
  type: "organizers";
  items: OrganizerSearchResult[];
  total: number;
  page: number;
  pageSize: number;
}
