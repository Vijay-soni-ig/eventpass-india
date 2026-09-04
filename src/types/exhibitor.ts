export type ExhibitionStatus = 'draft' | 'live' | 'paused' | 'completed';
export type Visibility = 'public' | 'private';
export type StallType = 'premium' | 'standard' | 'basic';
export type StallStatus = 'available' | 'reserved' | 'sold';
export type PaymentStatus = 'paid' | 'pending' | 'refunded';
export type TeamRole = 'owner' | 'finance' | 'operations' | 'marketing' | 'scanner';
export type TeamMemberStatus = 'active' | 'invited';
export type KycStatus = 'pending' | 'verified';

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

export interface TeamMember {
  id: string;
  businessId: string;
  invitedEmail: string;
  userId: string | null;
  role: TeamRole;
  status: TeamMemberStatus;
  createdAt: string;
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
