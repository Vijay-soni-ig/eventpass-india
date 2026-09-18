export interface UniversalEventListItem {
  id: string; title: string; slug: string | null; description: string | null; eventType: string;
  categoryId: string | null; category: { id: string; name: string; slug: string } | null;
  status: string; visibility: string; startDate: string | null; endDate: string | null; timezone: string;
  venue: string | null; city: string | null; latitude: number | null; longitude: number | null;
  coverImageUrl: string | null;
  organizer: { id: string; name: string; slug: string | null; logoUrl: string | null };
  exhibition: { id: string } | null;
}
export interface UniversalEventListResponse { events: UniversalEventListItem[]; total: number; page: number; pageSize: number; }
export interface UniversalEventDetail extends Omit<UniversalEventListItem, "category" | "organizer"> {
  refundPolicy: string | null; terms: string | null;
  category: { id: string; name: string; slug: string; description: string | null } | null;
  organizer: { id: string; name: string; slug: string | null; logoUrl: string | null; description: string | null; website: string | null; city: string | null; state: string | null; country: string | null };
  moduleEnablements: { moduleType: string; config: unknown }[];
}