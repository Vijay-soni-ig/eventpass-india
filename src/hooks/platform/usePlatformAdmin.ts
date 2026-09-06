import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface PlatformPeriodMetric {
  current: number;
  previous: number;
  changePct: number | null;
}

export interface PlatformAttentionItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  context: string;
  timestamp: string;
  actionLabel: string;
  actionHref: string;
}

export interface PlatformTopExhibition {
  id: string;
  name: string;
  status: string;
  organizerName: string;
  startDate: string | null;
  exhibitors: number;
  visitors: number;
  revenue: number;
}

export interface PlatformTopOrganizer {
  id: string;
  name: string;
  suspended: boolean;
  exhibitions: number;
  exhibitors: number;
  visitors: number;
  revenue: number;
}

export interface PlatformDashboardMetrics {
  range: { from: string; to: string; granularity: "day" | "week" | "month" };
  kpis: {
    revenue: PlatformPeriodMetric;
    transactions: PlatformPeriodMetric;
    activeExhibitions: { current: number; startingSoon: number };
    organizers: { total: number; active: number };
    exhibitors: { total: number; newInPeriod: number };
    visitors: PlatformPeriodMetric;
  };
  revenueSeries: { date: string; revenue: number; transactions: number }[];
  activityBreakdown: { newOrganizers: number; newExhibitions: number; newExhibitors: number; newVisitors: number };
  exhibitionBreakdown: { status: string; count: number }[];
  topExhibitions: PlatformTopExhibition[];
  topOrganizers: PlatformTopOrganizer[];
  subscriptions: {
    active: number;
    trialing: number;
    expiringSoon: number;
    expired: number;
    cancelled: number;
    noPlan: number;
  };
  attention: PlatformAttentionItem[];
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    actorUserId: string | null;
    actorEmail: string | null;
    createdAt: string;
  }[];
}

export interface PlatformDashboardFilters {
  from: string;
  to: string;
  granularity: "day" | "week" | "month";
}

export function usePlatformDashboard(filters: PlatformDashboardFilters) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to, granularity: filters.granularity });
  return useQuery({
    queryKey: ["platform-dashboard", filters],
    queryFn: () => api.get<PlatformDashboardMetrics>(`/api/platform/dashboard?${params.toString()}`),
  });
}

export interface PlatformOrganizer {
  id: string;
  name: string;
  businessType?: string | null;
  address?: string | null;
  gst?: string | null;
  pan?: string | null;
  website?: string | null;
  kycStatus: "pending" | "verified";
  bankVerified: boolean;
  suspended: boolean;
  suspendedReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
  _count: { exhibitions: number; memberships: number };
  contact?: { name: string | null; email: string | null; phone: string | null };
  exhibitorsCount?: number;
  visitorsCount?: number;
  ticketRevenue?: number;
  stallRevenue?: number;
  subscription?: { status: string; planName: string } | null;
  lastActive?: string | null;
}

export interface PlatformOrganizerFilters {
  search?: string;
  suspended?: boolean;
  kycStatus?: "pending" | "verified";
  subscriptionStatus?: string;
}

export function usePlatformOrganizers(filters: PlatformOrganizerFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.suspended !== undefined) params.set("suspended", String(filters.suspended));
  if (filters.kycStatus) params.set("kycStatus", filters.kycStatus);
  if (filters.subscriptionStatus) params.set("subscriptionStatus", filters.subscriptionStatus);
  const qs = params.toString();

  return useQuery({
    queryKey: ["platform-organizers", filters],
    queryFn: () => api.get<{ organizers: PlatformOrganizer[] }>(`/api/platform/organizers${qs ? `?${qs}` : ""}`).then((r) => r.organizers),
  });
}

export function usePlatformOrganizer(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-organizer", id],
    queryFn: () => api.get<{ organizer: PlatformOrganizer }>(`/api/platform/organizers/${id}`).then((r) => r.organizer),
    enabled: !!id,
  });
}

export function useSuspendOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspended, reason }: { id: string; suspended: boolean; reason?: string }) =>
      api.patch<{ organizer: PlatformOrganizer }>(`/api/platform/organizers/${id}/suspend`, { suspended, reason }).then((r) => r.organizer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-organizers"] });
      queryClient.invalidateQueries({ queryKey: ["platform-organizer"] });
    },
  });
}

export function useUpdateOrganizerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; businessType?: string | null; address?: string | null; gst?: string | null; pan?: string | null; website?: string | null }) =>
      api.patch<{ organizer: PlatformOrganizer }>(`/api/platform/organizers/${id}`, data).then((r) => r.organizer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-organizers"] });
      queryClient.invalidateQueries({ queryKey: ["platform-organizer"] });
    },
  });
}

export function useSetOrganizerKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      api.patch<{ organizer: PlatformOrganizer }>(`/api/platform/organizers/${id}/kyc`, { verified }).then((r) => r.organizer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-organizers"] });
      queryClient.invalidateQueries({ queryKey: ["platform-organizer"] });
    },
  });
}

export function usePlatformOrganizerExhibitors(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-organizer-exhibitors", id],
    queryFn: () => api.get<{ participations: unknown[] }>(`/api/platform/organizers/${id}/exhibitors`).then((r) => r.participations),
    enabled: !!id,
  });
}

export function usePlatformOrganizerPayments(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-organizer-payments", id],
    queryFn: () => api.get<{ payments: unknown[] }>(`/api/platform/organizers/${id}/payments`).then((r) => r.payments),
    enabled: !!id,
  });
}

export function usePlatformOrganizerExhibitions(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-organizer-exhibitions", id],
    queryFn: () => api.get<{ exhibitions: unknown[] }>(`/api/platform/organizers/${id}/exhibitions`).then((r) => r.exhibitions),
    enabled: !!id,
  });
}

export interface PlatformOrganizerUsage {
  exhibitionsCount: number;
  activeExhibitionsCount: number;
  teamMemberCount: number;
  ticketBookingsCount: number;
  stallBookingsCount: number;
  ticketRevenue: number;
}

export function usePlatformOrganizerUsage(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-organizer-usage", id],
    queryFn: () => api.get<PlatformOrganizerUsage>(`/api/platform/organizers/${id}/usage`),
    enabled: !!id,
  });
}

export function usePlatformOrganizerTeam(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-organizer-team", id],
    queryFn: () => api.get<{ members: unknown[] }>(`/api/platform/organizers/${id}/team`).then((r) => r.members),
    enabled: !!id,
  });
}

export interface PlatformPlan {
  id: string;
  code: string;
  name: string;
  billingInterval: "monthly" | "yearly" | "one_time" | "custom";
  price: string | number;
  currency: string;
  active: boolean;
  eventLimit: number | null;
  visitorLimit: number | null;
  exhibitorLimit: number | null;
  stallLimit: number | null;
  teamMemberLimit: number | null;
}

export interface PlatformSubscription {
  id: string;
  organizerId: string;
  planId: string;
  plan: PlatformPlan;
  status: "trialing" | "active" | "cancelled" | "expired" | "inactive";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformEntitlementUsage {
  resource: "exhibition" | "exhibitor" | "visitor" | "stall" | "team_member";
  currentUsage: number;
  limit: number | null;
}

export interface PlatformSubscriptionResponse {
  subscription: PlatformSubscription | null;
  usage: PlatformEntitlementUsage[] | null;
  trialConsumed: boolean | null;
}

export function usePlatformOrganizerSubscription(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-organizer-subscription", id],
    queryFn: () => api.get<PlatformSubscriptionResponse>(`/api/platform/organizers/${id}/subscription`),
    enabled: !!id,
  });
}

export function usePlatformPlans() {
  return useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => api.get<{ plans: PlatformPlan[] }>("/api/platform/plans").then((r) => r.plans),
  });
}

/** Administrative only — never collects payment (Razorpay remains deferred). See docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md. */
export function useActivateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizerId, currentPeriodStart, currentPeriodEnd }: { organizerId: string; currentPeriodStart?: string; currentPeriodEnd?: string }) =>
      api
        .post<{ subscription: PlatformSubscription }>(`/api/platform/organizers/${organizerId}/subscription/activate`, { currentPeriodStart, currentPeriodEnd })
        .then((r) => r.subscription),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-organizer-subscription", variables.organizerId] });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizerId }: { organizerId: string }) =>
      api.post<{ subscription: PlatformSubscription }>(`/api/platform/organizers/${organizerId}/subscription/cancel`, {}).then((r) => r.subscription),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-organizer-subscription", variables.organizerId] });
    },
  });
}

export function useExpireSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizerId }: { organizerId: string }) =>
      api.post<{ subscription: PlatformSubscription }>(`/api/platform/organizers/${organizerId}/subscription/expire`, {}).then((r) => r.subscription),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-organizer-subscription", variables.organizerId] });
    },
  });
}

export function useChangeSubscriptionPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizerId, planId }: { organizerId: string; planId: string }) =>
      api.patch<{ subscription: PlatformSubscription }>(`/api/platform/organizers/${organizerId}/subscription/plan`, { planId }).then((r) => r.subscription),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-organizer-subscription", variables.organizerId] });
    },
  });
}

export interface PlatformAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorUser: { id: string; email: string; fullName: string | null } | null;
  metadata: unknown;
  createdAt: string;
}

export function usePlatformOrganizerAudit(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-organizer-audit", id],
    queryFn: () => api.get<{ logs: PlatformAuditLog[] }>(`/api/platform/organizers/${id}/audit`).then((r) => r.logs),
    enabled: !!id,
  });
}

// -------- Exhibitions --------

export interface PlatformExhibitionListItem {
  id: string;
  name: string;
  city: string | null;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  createdAt: string;
  organizer: { id: string; name: string };
  totalStalls: number;
  bookedStalls: number;
  availableStalls: number;
  exhibitorsCount: number;
  visitorsCount: number;
  ticketsSold: number;
  ticketRevenue: number;
  stallRevenue: number;
}

export interface PlatformExhibitionFilters {
  search?: string;
  organizerId?: string;
  city?: string;
  status?: string;
}

function toQuery(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function usePlatformExhibitions(filters: PlatformExhibitionFilters = {}) {
  return useQuery({
    queryKey: ["platform-exhibitions", filters],
    queryFn: () =>
      api
        .get<{ exhibitions: PlatformExhibitionListItem[] }>(`/api/platform/exhibitions${toQuery(filters as Record<string, string | undefined>)}`)
        .then((r) => r.exhibitions),
  });
}

export interface PlatformExhibitionDetail {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  organizer: { id: string; name: string };
  totalStalls: number;
  bookedStalls: number;
  availableStalls: number;
  exhibitorsCount: number;
  ticketsSold: number;
  totalRevenue: number;
}

export function usePlatformExhibition(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibition", id],
    queryFn: () => api.get<{ exhibition: PlatformExhibitionDetail }>(`/api/platform/exhibitions/${id}`).then((r) => r.exhibition),
    enabled: !!id,
  });
}

export interface PlatformStall {
  id: string;
  code: string | null;
  stallType: string | null;
  size: string | null;
  price: string | number;
  status: "available" | "reserved" | "sold";
  exhibitionExhibitorId: string | null;
  exhibitionExhibitor: { id: string; business: { id: string; companyName: string | null } } | null;
  bookings: { paymentStatus: string }[];
}

export function usePlatformExhibitionStalls(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibition-stalls", exhibitionId],
    queryFn: () => api.get<{ stalls: PlatformStall[] }>(`/api/platform/exhibitions/${exhibitionId}/stalls`).then((r) => r.stalls),
    enabled: !!exhibitionId,
  });
}

export function useAdminStallAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      exhibitionId,
      stallId,
      ...data
    }: {
      exhibitionId: string;
      stallId: string;
      action?: "assign" | "release";
      exhibitionExhibitorId?: string;
      stallType?: string | null;
      size?: string | null;
      price?: number;
    }) => api.patch<{ stall: PlatformStall }>(`/api/platform/exhibitions/${exhibitionId}/stalls/${stallId}`, data).then((r) => r.stall),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-exhibition-stalls", variables.exhibitionId] });
      queryClient.invalidateQueries({ queryKey: ["platform-exhibition", variables.exhibitionId] });
      queryClient.invalidateQueries({ queryKey: ["platform-exhibition-exhibitors", variables.exhibitionId] });
    },
  });
}

export interface PlatformExhibitionTicket {
  id: string;
  name: string;
  price: number;
  quantity: number;
  visible: boolean;
  sold: number;
  remaining: number;
  checkedIn: number;
  revenue: number;
}

export function usePlatformExhibitionTickets(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibition-tickets", exhibitionId],
    queryFn: () => api.get<{ tickets: PlatformExhibitionTicket[] }>(`/api/platform/exhibitions/${exhibitionId}/tickets`).then((r) => r.tickets),
    enabled: !!exhibitionId,
  });
}

export function useUpdateExhibitionTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      exhibitionId,
      ticketTypeId,
      ...data
    }: {
      exhibitionId: string;
      ticketTypeId: string;
      name?: string;
      price?: number;
      quantity?: number;
      visible?: boolean;
    }) => api.patch<{ ticket: PlatformExhibitionTicket }>(`/api/platform/exhibitions/${exhibitionId}/tickets/${ticketTypeId}`, data).then((r) => r.ticket),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-exhibition-tickets", variables.exhibitionId] });
    },
  });
}

export function usePlatformExhibitionExhibitors(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibition-exhibitors", exhibitionId],
    queryFn: () => api.get<{ participations: unknown[] }>(`/api/platform/exhibitions/${exhibitionId}/exhibitors`).then((r) => r.participations),
    enabled: !!exhibitionId,
  });
}

export function usePlatformExhibitionVisitors(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibition-visitors", exhibitionId],
    queryFn: () => api.get<{ bookings: unknown[] }>(`/api/platform/exhibitions/${exhibitionId}/visitors`).then((r) => r.bookings),
    enabled: !!exhibitionId,
  });
}

export function usePlatformExhibitionPayments(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibition-payments", exhibitionId],
    queryFn: () => api.get<{ payments: unknown[] }>(`/api/platform/exhibitions/${exhibitionId}/payments`).then((r) => r.payments),
    enabled: !!exhibitionId,
  });
}

export function usePlatformExhibitionAnalytics(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibition-analytics", exhibitionId],
    queryFn: () => api.get(`/api/platform/exhibitions/${exhibitionId}/analytics`),
    enabled: !!exhibitionId,
  });
}

// -------- Exhibitors --------

export interface PlatformExhibitorListItem {
  id: string;
  companyName: string | null;
  businessType: string | null;
  kycStatus: "pending" | "verified";
  suspended: boolean;
  createdAt: string;
  owner: { id: string; fullName: string | null; email: string; phone: string | null };
  participationsCount: number;
  stallsBooked: number;
  totalPaid: number;
  outstandingAmount: number;
}

export interface PlatformExhibitorFilters {
  search?: string;
  kycStatus?: "pending" | "verified";
  suspended?: boolean;
  category?: string;
  exhibitionId?: string;
}

export function usePlatformExhibitors(filters: PlatformExhibitorFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.kycStatus) params.set("kycStatus", filters.kycStatus);
  if (filters.suspended !== undefined) params.set("suspended", String(filters.suspended));
  if (filters.category) params.set("category", filters.category);
  if (filters.exhibitionId) params.set("exhibitionId", filters.exhibitionId);
  const qs = params.toString();
  return useQuery({
    queryKey: ["platform-exhibitors", filters],
    queryFn: () => api.get<{ exhibitors: PlatformExhibitorListItem[] }>(`/api/platform/exhibitors${qs ? `?${qs}` : ""}`).then((r) => r.exhibitors),
  });
}

export interface PlatformExhibitorDetail {
  id: string;
  companyName: string | null;
  businessType: string | null;
  address: string | null;
  gst: string | null;
  pan: string | null;
  website: string | null;
  taxCategory: string | null;
  invoicePreference: string | null;
  kycStatus: "pending" | "verified";
  suspended: boolean;
  suspendedReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
  owner: { id: string; fullName: string | null; email: string; phone: string | null };
  _count: { participations: number };
}

export function usePlatformExhibitor(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibitor", id],
    queryFn: () => api.get<{ exhibitor: PlatformExhibitorDetail }>(`/api/platform/exhibitors/${id}`).then((r) => r.exhibitor),
    enabled: !!id,
  });
}

export function useUpdateExhibitorProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, string | null | undefined>) =>
      api.patch<{ exhibitor: PlatformExhibitorDetail }>(`/api/platform/exhibitors/${id}`, data).then((r) => r.exhibitor),
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-exhibitors"] });
      queryClient.invalidateQueries({ queryKey: ["platform-exhibitor", variables.id] });
    },
  });
}

export function useSetExhibitorKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      api.patch<{ exhibitor: PlatformExhibitorDetail }>(`/api/platform/exhibitors/${id}/kyc`, { verified }).then((r) => r.exhibitor),
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-exhibitors"] });
      queryClient.invalidateQueries({ queryKey: ["platform-exhibitor", variables.id] });
    },
  });
}

export function useSuspendExhibitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspended, reason }: { id: string; suspended: boolean; reason?: string }) =>
      api.patch<{ exhibitor: PlatformExhibitorDetail }>(`/api/platform/exhibitors/${id}/suspend`, { suspended, reason }).then((r) => r.exhibitor),
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-exhibitors"] });
      queryClient.invalidateQueries({ queryKey: ["platform-exhibitor", variables.id] });
    },
  });
}

export function usePlatformExhibitorExhibitions(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibitor-exhibitions", id],
    queryFn: () => api.get<{ participations: unknown[] }>(`/api/platform/exhibitors/${id}/exhibitions`).then((r) => r.participations),
    enabled: !!id,
  });
}

export function usePlatformExhibitorPayments(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibitor-payments", id],
    queryFn: () => api.get<{ payments: unknown[] }>(`/api/platform/exhibitors/${id}/payments`).then((r) => r.payments),
    enabled: !!id,
  });
}

export function usePlatformExhibitorLeads(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibitor-leads", id],
    queryFn: () => api.get<{ leads: unknown[] }>(`/api/platform/exhibitors/${id}/leads`).then((r) => r.leads),
    enabled: !!id,
  });
}

export function usePlatformExhibitorAudit(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-exhibitor-audit", id],
    queryFn: () => api.get<{ logs: PlatformAuditLog[] }>(`/api/platform/exhibitors/${id}/audit`).then((r) => r.logs),
    enabled: !!id,
  });
}

// -------- Visitors --------

export interface PlatformVisitorListItem {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  suspended: boolean;
  createdAt: string;
  ticketsCount: number;
  exhibitionsCount: number;
  lastPurchase: string | null;
  checkInsCount: number;
  totalSpent: number;
}

export function usePlatformVisitors(filters: { search?: string; suspended?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.suspended !== undefined) params.set("suspended", String(filters.suspended));
  const qs = params.toString();
  return useQuery({
    queryKey: ["platform-visitors", filters],
    queryFn: () => api.get<{ visitors: PlatformVisitorListItem[] }>(`/api/platform/visitors${qs ? `?${qs}` : ""}`).then((r) => r.visitors),
  });
}

export interface PlatformVisitorDetail {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  suspended: boolean;
  suspendedReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
  ticketsCount: number;
  checkInsCount: number;
  totalSpent: number;
  exhibitionsCount: number;
}

export function usePlatformVisitor(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-visitor", id],
    queryFn: () => api.get<{ visitor: PlatformVisitorDetail }>(`/api/platform/visitors/${id}`).then((r) => r.visitor),
    enabled: !!id,
  });
}

export function useSuspendVisitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspended, reason }: { id: string; suspended: boolean; reason?: string }) =>
      api.patch<{ visitor: { id: string; suspended: boolean } }>(`/api/platform/visitors/${id}/suspend`, { suspended, reason }).then((r) => r.visitor),
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-visitors"] });
      queryClient.invalidateQueries({ queryKey: ["platform-visitor", variables.id] });
    },
  });
}

export function usePlatformVisitorTickets(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-visitor-tickets", id],
    queryFn: () => api.get<{ bookings: unknown[] }>(`/api/platform/visitors/${id}/tickets`).then((r) => r.bookings),
    enabled: !!id,
  });
}

export function usePlatformVisitorPayments(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-visitor-payments", id],
    queryFn: () => api.get<{ payments: unknown[] }>(`/api/platform/visitors/${id}/payments`).then((r) => r.payments),
    enabled: !!id,
  });
}

export function usePlatformVisitorCheckIns(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-visitor-checkins", id],
    queryFn: () => api.get<{ checkIns: unknown[] }>(`/api/platform/visitors/${id}/checkins`).then((r) => r.checkIns),
    enabled: !!id,
  });
}

export function usePlatformVisitorAudit(id: string | undefined) {
  return useQuery({
    queryKey: ["platform-visitor-audit", id],
    queryFn: () => api.get<{ logs: PlatformAuditLog[] }>(`/api/platform/visitors/${id}/audit`).then((r) => r.logs),
    enabled: !!id,
  });
}

export function usePlatformPayments(status?: string) {
  return useQuery({
    queryKey: ["platform-payments", status],
    queryFn: () => api.get<{ payments: unknown[] }>(`/api/platform/payments${status ? `?status=${status}` : ""}`).then((r) => r.payments),
  });
}

export function usePlatformAuditLogs(filters: { action?: string; entityType?: string; actorUserId?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return useQuery({
    queryKey: ["platform-audit-logs", filters],
    queryFn: () => api.get<{ logs: PlatformAuditLog[] }>(`/api/platform/audit-logs${qs ? `?${qs}` : ""}`).then((r) => r.logs),
  });
}

// -------- Cross-organizer subscriptions --------

export interface PlatformSubscriptionRow {
  organizerId: string;
  organizerName: string;
  suspended: boolean;
  subscription: PlatformSubscription | null;
  usage: PlatformEntitlementUsage[] | null;
}

export interface PlatformSubscriptionsSummary {
  active: number;
  trialing: number;
  expiringSoon: number;
  expired: number;
  cancelled: number;
  noPlan: number;
  mrr: number;
}

export function usePlatformSubscriptions(filters: { search?: string; status?: string; expiringSoon?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.expiringSoon) params.set("expiringSoon", "true");
  const qs = params.toString();
  return useQuery({
    queryKey: ["platform-subscriptions", filters],
    queryFn: () =>
      api.get<{ summary: PlatformSubscriptionsSummary; subscriptions: PlatformSubscriptionRow[] }>(
        `/api/platform/subscriptions${qs ? `?${qs}` : ""}`
      ),
  });
}

// -------- Support tickets --------

export type SupportTicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";
export type SupportTicketCategory = "account" | "exhibition" | "exhibitor" | "visitor" | "payment" | "subscription" | "technical" | "other";

interface SupportUserRef {
  id: string;
  email: string;
  fullName: string | null;
}

export interface SupportTicketListItem {
  id: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  requesterName: string | null;
  requesterEmail: string | null;
  organizer: { id: string; name: string } | null;
  assignedToUser: SupportUserRef | null;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  authorUserId: string | null;
  authorUser: SupportUserRef | null;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface SupportTicketDetail {
  id: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterUserId: string | null;
  requesterUser: SupportUserRef | null;
  organizerId: string | null;
  organizer: { id: string; name: string } | null;
  assignedToUserId: string | null;
  assignedToUser: SupportUserRef | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  messages: SupportTicketMessage[];
}

export function useSupportTickets(
  filters: { search?: string; status?: string; priority?: string; category?: string; assignedToUserId?: string; unassigned?: boolean } = {}
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== "") params.set(k, String(v));
  });
  const qs = params.toString();
  return useQuery({
    queryKey: ["support-tickets", filters],
    queryFn: () => api.get<{ tickets: SupportTicketListItem[] }>(`/api/platform/support${qs ? `?${qs}` : ""}`).then((r) => r.tickets),
  });
}

export function useSupportTicket(id: string | undefined) {
  return useQuery({
    queryKey: ["support-ticket", id],
    queryFn: () => api.get<{ ticket: SupportTicketDetail }>(`/api/platform/support/${id}`).then((r) => r.ticket),
    enabled: !!id,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      subject: string;
      description: string;
      category: SupportTicketCategory;
      priority: SupportTicketPriority;
      requesterName?: string;
      requesterEmail?: string;
      organizerId?: string;
    }) => api.post<{ ticket: SupportTicketDetail }>("/api/platform/support", data).then((r) => r.ticket),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });
}

export function useUpdateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      assignedToUserId?: string | null;
    }) => api.patch<{ ticket: SupportTicketDetail }>(`/api/platform/support/${id}`, data).then((r) => r.ticket),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support-ticket", variables.id] });
    },
  });
}

export function useAddSupportMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, body, isInternalNote }: { ticketId: string; body: string; isInternalNote: boolean }) =>
      api.post<{ message: SupportTicketMessage }>(`/api/platform/support/${ticketId}/messages`, { body, isInternalNote }).then((r) => r.message),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["support-ticket", variables.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });
}

// -------- Platform settings --------

export interface PlatformSettingsData {
  id: string;
  platformName: string;
  supportEmail: string | null;
  defaultCurrency: string;
  defaultTimezone: string;
  dateFormat: string;
  allowOrganizerRegistration: boolean;
  allowExhibitionCreation: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  updatedAt: string;
  updatedByUserId: string | null;
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => api.get<{ settings: PlatformSettingsData }>("/api/platform/settings").then((r) => r.settings),
  });
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Omit<PlatformSettingsData, "id" | "updatedAt" | "updatedByUserId">>) =>
      api.patch<{ settings: PlatformSettingsData }>("/api/platform/settings", data).then((r) => r.settings),
    onSuccess: (settings) => {
      queryClient.setQueryData(["platform-settings"], settings);
    },
  });
}
