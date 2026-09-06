export type ExhibitionStatus = 'draft' | 'live' | 'paused' | 'completed';
export type Visibility = 'public' | 'private';
export type StallType = 'premium' | 'standard' | 'basic';
export type StallStatus = 'available' | 'reserved' | 'sold';
export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type CheckInMethod = 'qr' | 'manual';
export type KycStatus = 'pending' | 'verified';

export interface OrganizerSocialLink {
  id: string;
  platform: string;
  url: string;
  sortOrder?: number;
  active?: boolean;
}

// Phase 22.2 — organizer gallery/media. The dashboard shape includes
// moderation fields (active/archivedAt); the public shape (see
// usePublicOrganizerGallery) only ever returns id/imageUrl/caption/altText/
// isFeatured — never archivedAt or organizerId.
export interface OrganizerGalleryMedia {
  id: string;
  organizerId?: string;
  imageUrl: string;
  caption: string | null;
  altText: string | null;
  sortOrder: number;
  isFeatured: boolean;
  active: boolean;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Phase 22.1 — organizer public profile. Bank/tax fields are only ever
// populated by the server for a caller who can manage the profile (see
// routes/organizerProfile.ts's BANK_AND_TAX_FIELDS redaction) — they're
// simply absent (null) otherwise, and never present at all in the public
// GET /api/public/organizers/:slug response.
export interface Organizer {
  id: string;
  name: string;
  businessType: string | null;
  address: string | null;
  gst: string | null;
  pan: string | null;
  website: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  kycStatus: KycStatus;
  description: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  publicProfileEnabled: boolean;
  slug: string | null;
  createdAt: string;
  socialLinks?: OrganizerSocialLink[];
  _count?: { follows: number; exhibitions?: number };
}

export interface Business {
  id: string;
  ownerId: string;
  companyName: string | null;
  businessType: string | null;
  address: string | null;
  gst: string | null;
  pan: string | null;
  website: string | null;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  kycStatus: KycStatus;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  taxCategory: string | null;
  invoicePreference: string | null;
  bankVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketType {
  id: string;
  exhibitionId: string;
  name: string;
  price: string | number;
  quantity: number;
  taxPercent: string | number;
  visible: boolean;
  createdAt: string;
  // Phase 21C (P2-3): only populated by GET /api/public/exhibitions/:id
  // (the public exhibition detail endpoint) — actual remaining stock
  // (quantity minus still-consuming bookings), not the raw total allotment.
  // Absent from every other endpoint that returns a TicketType.
  remaining?: number;
}

export interface Stall {
  id: string;
  exhibitionId: string;
  code: string | null;
  stallType: StallType | null;
  size: string | null;
  price: string | number;
  status: StallStatus;
  posX: string | number | null;
  posY: string | number | null;
  width: string | number | null;
  height: string | number | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Exhibition {
  id: string;
  ownerId: string;
  name: string;
  category: string | null;
  description: string | null;
  venue: string | null;
  city: string | null;
  // Real venue coordinates, set by the organizer — null for most exhibitions
  // today. Only used by the homepage's "Events Near You" nearby-search
  // feature (GET /api/public/discover's lat/lng/radiusKm params).
  latitude: number | null;
  longitude: number | null;
  startDate: string | null;
  endDate: string | null;
  coverImageUrl: string | null;
  floorPlanUrl: string | null;
  status: ExhibitionStatus;
  visibility: Visibility;
  refundPolicy: string | null;
  terms: string | null;
  createdAt: string;
  updatedAt: string;
  ticketTypes?: TicketType[];
  stalls?: Stall[];
  _count?: { ticketBookings: number; stallBookings: number };
  // Phase 25 — organizer-managed Exhibition Details content. Only present on
  // GET /api/public/exhibitions/:id (already filtered server-side to
  // active:true rows only, ordered by sortOrder — see routes/public.ts).
  media?: { id: string; imageUrl: string; altText: string | null; caption: string | null; sortOrder: number }[];
  schedules?: { id: string; date: string; startTime: string | null; endTime: string | null; title: string; description: string | null; sortOrder: number }[];
  highlights?: { id: string; title: string; description: string | null; iconKey: string | null; sortOrder: number }[];
  audiences?: { id: string; name: string; description: string | null; sortOrder: number }[];
  faqs?: { id: string; question: string; answer: string; sortOrder: number }[];
  // Phase 22.4 — present on discovery/search results (GET
  // /api/public/discover?type=events). Phase 23.2 — also present on the
  // single-exhibition detail endpoint (GET /api/public/exhibitions/:id).
  // Not present on the plain GET /api/public/exhibitions list endpoint.
  organizer?: { id: string; name: string; slug: string | null; logoUrl: string | null; kycStatus: KycStatus };
  // Only present on GET /api/public/discover?type=events responses that
  // included lat/lng/radiusKm (the homepage's nearby-search feature) — a
  // real server-computed Haversine distance in kilometers, never a
  // client-side guess. Absent (undefined) on every other response shape.
  distanceKm?: number | null;
}

export interface CheckIn {
  id: string;
  ticketBookingId: string;
  scannedByUserId: string | null;
  method: CheckInMethod;
  isOverride: boolean;
  scannedAt: string;
  scannedByUser?: { fullName: string | null; email: string } | null;
}

export interface TicketBooking {
  id: string;
  exhibitionId: string;
  ticketTypeId: string | null;
  buyerUserId: string | null;
  attendeeName: string | null;
  attendeeEmail: string | null;
  attendeePhone: string | null;
  quantity: number;
  unitPrice: string | number;
  amountPaid: string | number;
  paymentStatus: PaymentStatus;
  qrCode: string;
  checkInStatus: boolean;
  checkInTime: string | null;
  visitDate: string | null;
  createdAt: string;
  exhibition?: Exhibition;
  ticketType?: TicketType;
  checkIns?: CheckIn[];
}

export interface Payment {
  id: string;
  amount: string | number;
  currency: string;
  gateway: string | null;
  gatewayRefId: string | null;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StallBooking {
  id: string;
  stallId: string;
  exhibitionId: string;
  buyerUserId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  amountPaid: string | number;
  paymentStatus: PaymentStatus;
  paymentId?: string | null;
  createdAt: string;
  exhibition?: Exhibition;
  stall?: Stall;
  payment?: Payment;
}
