/**
 * EVENTPASS V2 — development seed.
 *
 * Populates a realistic multi-tenant dataset for local integration testing:
 * 1 platform admin, 1 organizer tenant (all 6 member roles), 4 exhibitor
 * businesses (varying membership depth and participation states), 1 live
 * exhibition with stalls/ticket types, 20 visitors, a mixture of ticket/
 * payment/check-in states, leads across every status, and a few audit-log
 * entries.
 *
 * Every row uses a fixed, deterministic id (e.g. "seed-user-org1-owner")
 * instead of a random uuid, and every write is an `upsert` keyed on that id.
 * Re-running this script updates the same rows in place rather than creating
 * duplicates — safe to run as many times as you like against a dev database.
 *
 * Usage:
 *   cd server
 *   npx prisma db seed
 *   (or, equivalently: npx tsx prisma/seed.ts)
 *
 * All seed users share the password: DevPassword123!
 * (bcrypt-hashed, same as any real signup — not a plaintext bypass.)
 *
 * This script is dev/test tooling only. It is never imported by the app and
 * is intentionally outside tsconfig.json's "src" include, so it has no
 * effect on the production build.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const DEV_PASSWORD = "DevPassword123!";
const EMAIL_DOMAIN = "eventpass.test"; // .test is reserved for non-production use (RFC 2606)

// Fixed "now" reference so followUpDate/date fields are relative to the
// exhibition dates below rather than to whenever the seed happens to run.
const TODAY = new Date("2026-09-04T00:00:00.000Z");
function daysFrom(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function upsertUser(params: {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  userType?: "visitor" | "exhibitor";
  platformRole?: "super_admin";
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { id: params.id },
    update: {
      email: params.email,
      fullName: params.fullName,
      phone: params.phone,
      userType: params.userType ?? "visitor",
      platformRole: params.platformRole,
      passwordHash: params.passwordHash,
    },
    create: {
      id: params.id,
      email: params.email,
      fullName: params.fullName,
      phone: params.phone,
      userType: params.userType ?? "visitor",
      platformRole: params.platformRole,
      passwordHash: params.passwordHash,
    },
  });
}

async function main() {
  console.log("Seeding EVENTPASS V2 development data...");
  const passwordHash = await hash(DEV_PASSWORD);

  // ---------------------------------------------------------------------
  // PLATFORM
  // ---------------------------------------------------------------------
  const platformAdmin = await upsertUser({
    id: "seed-user-platform-admin",
    email: `platform.admin@${EMAIL_DOMAIN}`,
    fullName: "Priya Ranganathan",
    platformRole: "super_admin",
    passwordHash,
  });

  // ---------------------------------------------------------------------
  // ORGANIZER TENANT 1 — 6 member roles
  // ---------------------------------------------------------------------
  const org1Owner = await upsertUser({ id: "seed-user-org1-owner", email: `org1.owner@${EMAIL_DOMAIN}`, fullName: "Karthik Subramaniam", passwordHash });
  const org1Admin = await upsertUser({ id: "seed-user-org1-admin", email: `org1.admin@${EMAIL_DOMAIN}`, fullName: "Meera Nambiar", passwordHash });
  const org1Ops = await upsertUser({ id: "seed-user-org1-ops", email: `org1.ops@${EMAIL_DOMAIN}`, fullName: "Rahul Bhattacharya", passwordHash });
  const org1Finance = await upsertUser({ id: "seed-user-org1-finance", email: `org1.finance@${EMAIL_DOMAIN}`, fullName: "Sneha Kulkarni", passwordHash });
  const org1Marketing = await upsertUser({ id: "seed-user-org1-marketing", email: `org1.marketing@${EMAIL_DOMAIN}`, fullName: "Farhan Ahmed", passwordHash });
  const org1Scanner = await upsertUser({ id: "seed-user-org1-scanner", email: `org1.scanner@${EMAIL_DOMAIN}`, fullName: "Divya Prakash", passwordHash });

  const organizer1 = await prisma.organizer.upsert({
    where: { id: "seed-organizer-1" },
    update: {
      name: "Bengaluru Expo Collective",
      businessType: "Event Management",
      address: "MG Road, Bengaluru, Karnataka",
      gst: "29AASFB1234C1Z5",
      website: "https://bengaluruexpo.example",
      kycStatus: "verified",
      bankVerified: true,
      // UI-02B fix: this organizer's exhibitions are live/public, and the
      // public Exhibition Detail page always renders an organizer link +
      // Follow button when `exhibition.organizer` exists — but both
      // features are correctly gated server-side on `publicProfileEnabled`
      // (see server/src/routes/organizerFollows.ts, public.ts), which
      // defaults to false and was never set here. That's the real cause of
      // the follow-state 404 reported in UI-02A — not an ID/slug mismatch
      // (the code was already consistently ID-based). A real organizer
      // whose exhibitions are public would reasonably also have a public
      // profile, so this corrects the seed data to match that coherent
      // state rather than papering over it in application code.
      slug: "bengaluru-expo-collective",
      publicProfileEnabled: true,
    },
    create: {
      id: "seed-organizer-1",
      name: "Bengaluru Expo Collective",
      businessType: "Event Management",
      address: "MG Road, Bengaluru, Karnataka",
      gst: "29AASFB1234C1Z5",
      website: "https://bengaluruexpo.example",
      kycStatus: "verified",
      bankVerified: true,
      slug: "bengaluru-expo-collective",
      publicProfileEnabled: true,
    },
  });

  const orgMemberships: Array<{ id: string; userId: string; role: "owner" | "admin" | "operations" | "finance" | "marketing" | "scanner" }> = [
    { id: "seed-membership-org1-owner", userId: org1Owner.id, role: "owner" },
    { id: "seed-membership-org1-admin", userId: org1Admin.id, role: "admin" },
    { id: "seed-membership-org1-ops", userId: org1Ops.id, role: "operations" },
    { id: "seed-membership-org1-finance", userId: org1Finance.id, role: "finance" },
    { id: "seed-membership-org1-marketing", userId: org1Marketing.id, role: "marketing" },
    { id: "seed-membership-org1-scanner", userId: org1Scanner.id, role: "scanner" },
  ];
  for (const m of orgMemberships) {
    await prisma.organizerMembership.upsert({
      where: { id: m.id },
      update: { organizerId: organizer1.id, userId: m.userId, role: m.role, status: "active" },
      create: { id: m.id, organizerId: organizer1.id, userId: m.userId, role: m.role, status: "active" },
    });
  }
  // A pending invite that hasn't been accepted yet — exercises the
  // "invited" membership status (no linked user account).
  await prisma.organizerMembership.upsert({
    where: { id: "seed-membership-org1-marketing-pending" },
    update: { organizerId: organizer1.id, invitedEmail: `org1.pending@${EMAIL_DOMAIN}`, role: "marketing", status: "invited" },
    create: { id: "seed-membership-org1-marketing-pending", organizerId: organizer1.id, invitedEmail: `org1.pending@${EMAIL_DOMAIN}`, role: "marketing", status: "invited" },
  });

  // Phase 20B — every organizer has a subscription. This organizer was
  // created directly via upsert above (not through organizer.ts's
  // resolveOrganizerId(), which is where a REAL new organizer's trial
  // subscription gets created automatically), so the seed makes the same
  // Starter-trial state explicit here instead. Same deterministic id the
  // Phase 20B migration's own backfill uses ('sub-trial-' + organizer id)
  // so this upsert is a safe no-op if that backfill already created it
  // (the normal case in any environment where migrations ran first), and
  // still correct on a from-scratch database where they didn't.
  await prisma.subscription.upsert({
    where: { id: `sub-trial-${organizer1.id}` },
    update: { organizerId: organizer1.id, planId: "plan-starter", status: "trialing" },
    create: { id: `sub-trial-${organizer1.id}`, organizerId: organizer1.id, planId: "plan-starter", status: "trialing" },
  });

  // ---------------------------------------------------------------------
  // EXHIBITOR TENANTS — 4 businesses with varying membership depth
  // ---------------------------------------------------------------------
  const biz1Owner = await upsertUser({ id: "seed-user-biz1-owner", email: `biz1.owner@${EMAIL_DOMAIN}`, fullName: "Ananya Iyer", userType: "exhibitor", passwordHash });
  const biz1Admin = await upsertUser({ id: "seed-user-biz1-admin", email: `biz1.admin@${EMAIL_DOMAIN}`, fullName: "Vikram Chauhan", userType: "exhibitor", passwordHash });
  const biz1Staff = await upsertUser({ id: "seed-user-biz1-staff", email: `biz1.staff@${EMAIL_DOMAIN}`, fullName: "Ishaan Kapoor", userType: "exhibitor", passwordHash });

  const biz2Owner = await upsertUser({ id: "seed-user-biz2-owner", email: `biz2.owner@${EMAIL_DOMAIN}`, fullName: "Riya Sen", userType: "exhibitor", passwordHash });
  const biz2Staff = await upsertUser({ id: "seed-user-biz2-staff", email: `biz2.staff@${EMAIL_DOMAIN}`, fullName: "Arjun Rao", userType: "exhibitor", passwordHash });

  const biz3Owner = await upsertUser({ id: "seed-user-biz3-owner", email: `biz3.owner@${EMAIL_DOMAIN}`, fullName: "Kiara Desai", userType: "exhibitor", passwordHash });

  const biz4Owner = await upsertUser({ id: "seed-user-biz4-owner", email: `biz4.owner@${EMAIL_DOMAIN}`, fullName: "Zara Choudhury", userType: "exhibitor", passwordHash });

  const biz1 = await prisma.exhibitorBusiness.upsert({
    where: { id: "seed-exhibitor-biz-1" },
    update: { ownerId: biz1Owner.id, companyName: "Nimbus Robotics Pvt Ltd", businessType: "Robotics & Automation", gst: "29AABCN1234D1Z1", kycStatus: "verified", bankVerified: true },
    create: { id: "seed-exhibitor-biz-1", ownerId: biz1Owner.id, companyName: "Nimbus Robotics Pvt Ltd", businessType: "Robotics & Automation", gst: "29AABCN1234D1Z1", kycStatus: "verified", bankVerified: true },
  });
  const biz2 = await prisma.exhibitorBusiness.upsert({
    where: { id: "seed-exhibitor-biz-2" },
    update: { ownerId: biz2Owner.id, companyName: "GreenLeaf Organics", businessType: "Sustainable Consumer Goods", kycStatus: "verified" },
    create: { id: "seed-exhibitor-biz-2", ownerId: biz2Owner.id, companyName: "GreenLeaf Organics", businessType: "Sustainable Consumer Goods", kycStatus: "verified" },
  });
  const biz3 = await prisma.exhibitorBusiness.upsert({
    where: { id: "seed-exhibitor-biz-3" },
    update: { ownerId: biz3Owner.id, companyName: "Aarohi Textiles", businessType: "Textiles & Apparel", kycStatus: "pending" },
    create: { id: "seed-exhibitor-biz-3", ownerId: biz3Owner.id, companyName: "Aarohi Textiles", businessType: "Textiles & Apparel", kycStatus: "pending" },
  });
  const biz4 = await prisma.exhibitorBusiness.upsert({
    where: { id: "seed-exhibitor-biz-4" },
    update: { ownerId: biz4Owner.id, companyName: "Solstice Renewable Energy", businessType: "Renewable Energy", kycStatus: "pending" },
    create: { id: "seed-exhibitor-biz-4", ownerId: biz4Owner.id, companyName: "Solstice Renewable Energy", businessType: "Renewable Energy", kycStatus: "pending" },
  });

  const exhibitorMemberships: Array<{ id: string; businessId: string; userId: string; role: "owner" | "admin" | "staff" }> = [
    { id: "seed-membership-biz1-owner", businessId: biz1.id, userId: biz1Owner.id, role: "owner" },
    { id: "seed-membership-biz1-admin", businessId: biz1.id, userId: biz1Admin.id, role: "admin" },
    { id: "seed-membership-biz1-staff", businessId: biz1.id, userId: biz1Staff.id, role: "staff" },
    { id: "seed-membership-biz2-owner", businessId: biz2.id, userId: biz2Owner.id, role: "owner" },
    { id: "seed-membership-biz2-staff", businessId: biz2.id, userId: biz2Staff.id, role: "staff" },
    { id: "seed-membership-biz3-owner", businessId: biz3.id, userId: biz3Owner.id, role: "owner" },
    { id: "seed-membership-biz4-owner", businessId: biz4.id, userId: biz4Owner.id, role: "owner" },
  ];
  for (const m of exhibitorMemberships) {
    await prisma.exhibitorMembership.upsert({
      where: { id: m.id },
      update: { exhibitorBusinessId: m.businessId, userId: m.userId, role: m.role, status: "active" },
      create: { id: m.id, exhibitorBusinessId: m.businessId, userId: m.userId, role: m.role, status: "active" },
    });
  }

  // ---------------------------------------------------------------------
  // EXHIBITION — 1 live/published exhibition owned by Organizer 1
  // ---------------------------------------------------------------------
  const exhibition = await prisma.exhibition.upsert({
    where: { id: "seed-exhibition-1" },
    update: {
      ownerId: org1Owner.id,
      organizerId: organizer1.id,
      name: "Bengaluru Tech & Startup Expo 2026",
      category: "Technology",
      description: "A 3-day showcase of Bengaluru's technology, robotics, and startup ecosystem.",
      venue: "KTPO Whitefield Convention Centre",
      city: "Bengaluru",
      // Real public coordinates for the actual named venue (KTPO Whitefield,
      // Bengaluru) — not invented. Powers the homepage's "Events Near You"
      // map/nearby-search feature.
      latitude: 12.9698,
      longitude: 77.7500,
      startDate: daysFrom(TODAY, 69), // 2026-11-12
      endDate: daysFrom(TODAY, 71), // 2026-11-14
      status: "live",
      visibility: "public",
      refundPolicy: "Full refund up to 7 days before the event; no refunds within 7 days.",
      terms: "Standard exhibitor and visitor terms apply.",
    },
    create: {
      id: "seed-exhibition-1",
      ownerId: org1Owner.id,
      organizerId: organizer1.id,
      name: "Bengaluru Tech & Startup Expo 2026",
      category: "Technology",
      description: "A 3-day showcase of Bengaluru's technology, robotics, and startup ecosystem.",
      venue: "KTPO Whitefield Convention Centre",
      city: "Bengaluru",
      latitude: 12.9698,
      longitude: 77.7500,
      startDate: daysFrom(TODAY, 69),
      endDate: daysFrom(TODAY, 71),
      status: "live",
      visibility: "public",
      refundPolicy: "Full refund up to 7 days before the event; no refunds within 7 days.",
      terms: "Standard exhibitor and visitor terms apply.",
    },
  });

  // -- Ticket types: free, standard, VIP --
  const ticketTypeGeneral = await prisma.ticketType.upsert({
    where: { id: "seed-tickettype-general" },
    update: { exhibitionId: exhibition.id, name: "General Entry", price: 0, quantity: 500, taxPercent: 0, visible: true },
    create: { id: "seed-tickettype-general", exhibitionId: exhibition.id, name: "General Entry", price: 0, quantity: 500, taxPercent: 0, visible: true },
  });
  const ticketTypeStandard = await prisma.ticketType.upsert({
    where: { id: "seed-tickettype-standard" },
    update: { exhibitionId: exhibition.id, name: "Standard Pass", price: 499, quantity: 300, taxPercent: 18, visible: true },
    create: { id: "seed-tickettype-standard", exhibitionId: exhibition.id, name: "Standard Pass", price: 499, quantity: 300, taxPercent: 18, visible: true },
  });
  const ticketTypeVip = await prisma.ticketType.upsert({
    where: { id: "seed-tickettype-vip" },
    update: { exhibitionId: exhibition.id, name: "VIP Pass", price: 1999, quantity: 50, taxPercent: 18, visible: true },
    create: { id: "seed-tickettype-vip", exhibitionId: exhibition.id, name: "VIP Pass", price: 1999, quantity: 50, taxPercent: 18, visible: true },
  });

  // -- Stalls: two halls ("A"/"B" encoded in `code`, since the schema has
  // no dedicated floor field), varying type/price/status. --
  const stallDefs: Array<{
    id: string; code: string; stallType: "premium" | "standard" | "basic"; size: string; price: number;
    posX: number; posY: number; width: number; height: number; status: "available" | "reserved" | "sold";
  }> = [
    { id: "seed-stall-a01", code: "A-01", stallType: "premium", size: "4x4", price: 15000, posX: 0, posY: 0, width: 4, height: 4, status: "sold" },
    { id: "seed-stall-a02", code: "A-02", stallType: "premium", size: "4x4", price: 15000, posX: 5, posY: 0, width: 4, height: 4, status: "available" },
    { id: "seed-stall-a03", code: "A-03", stallType: "standard", size: "3x3", price: 8000, posX: 10, posY: 0, width: 3, height: 3, status: "reserved" },
    { id: "seed-stall-a04", code: "A-04", stallType: "standard", size: "3x3", price: 8000, posX: 14, posY: 0, width: 3, height: 3, status: "available" },
    { id: "seed-stall-a05", code: "A-05", stallType: "basic", size: "2x2", price: 4000, posX: 18, posY: 0, width: 2, height: 2, status: "available" },
    { id: "seed-stall-b01", code: "B-01", stallType: "standard", size: "3x3", price: 8000, posX: 0, posY: 6, width: 3, height: 3, status: "available" },
    { id: "seed-stall-b02", code: "B-02", stallType: "basic", size: "2x2", price: 4000, posX: 4, posY: 6, width: 2, height: 2, status: "available" },
    { id: "seed-stall-b03", code: "B-03", stallType: "basic", size: "2x2", price: 4000, posX: 7, posY: 6, width: 2, height: 2, status: "available" },
  ];
  const stalls: Record<string, Awaited<ReturnType<typeof prisma.stall.upsert>>> = {};
  for (const s of stallDefs) {
    stalls[s.id] = await prisma.stall.upsert({
      where: { id: s.id },
      update: { exhibitionId: exhibition.id, code: s.code, stallType: s.stallType, size: s.size, price: s.price, posX: s.posX, posY: s.posY, width: s.width, height: s.height, status: s.status },
      create: { id: s.id, exhibitionId: exhibition.id, code: s.code, stallType: s.stallType, size: s.size, price: s.price, posX: s.posX, posY: s.posY, width: s.width, height: s.height, status: s.status },
    });
  }

  // ---------------------------------------------------------------------
  // EXHIBITOR PARTICIPATIONS — different lifecycle states
  // ---------------------------------------------------------------------
  const participationBiz1 = await prisma.exhibitionExhibitor.upsert({
    where: { id: "seed-participation-biz1" },
    update: { exhibitionId: exhibition.id, exhibitorBusinessId: biz1.id, status: "confirmed", boothNumber: "A-01", confirmedAt: daysFrom(TODAY, -10) },
    create: { id: "seed-participation-biz1", exhibitionId: exhibition.id, exhibitorBusinessId: biz1.id, status: "confirmed", boothNumber: "A-01", confirmedAt: daysFrom(TODAY, -10) },
  });
  const participationBiz2 = await prisma.exhibitionExhibitor.upsert({
    where: { id: "seed-participation-biz2" },
    update: { exhibitionId: exhibition.id, exhibitorBusinessId: biz2.id, status: "payment_pending", boothNumber: "A-03" },
    create: { id: "seed-participation-biz2", exhibitionId: exhibition.id, exhibitorBusinessId: biz2.id, status: "payment_pending", boothNumber: "A-03" },
  });
  const participationBiz3 = await prisma.exhibitionExhibitor.upsert({
    where: { id: "seed-participation-biz3" },
    update: { exhibitionId: exhibition.id, exhibitorBusinessId: biz3.id, status: "applied" },
    create: { id: "seed-participation-biz3", exhibitionId: exhibition.id, exhibitorBusinessId: biz3.id, status: "applied" },
  });
  const participationBiz4 = await prisma.exhibitionExhibitor.upsert({
    where: { id: "seed-participation-biz4" },
    update: { exhibitionId: exhibition.id, exhibitorBusinessId: biz4.id, status: "rejected" },
    create: { id: "seed-participation-biz4", exhibitionId: exhibition.id, exhibitorBusinessId: biz4.id, status: "rejected" },
  });
  void participationBiz3;
  void participationBiz4;

  // Link the sold/reserved stalls to their participations (mirrors what
  // the real stall-selection endpoint does).
  await prisma.stall.update({ where: { id: "seed-stall-a01" }, data: { exhibitionExhibitorId: participationBiz1.id } });
  await prisma.stall.update({ where: { id: "seed-stall-a03" }, data: { exhibitionExhibitorId: participationBiz2.id } });

  // -- Stall bookings + payments backing those two participations --
  const biz1StallPayment = await prisma.payment.upsert({
    where: { id: "seed-payment-biz1-stall" },
    update: { amount: 15000, currency: "INR", provider: "mock", providerOrderId: "seed-order-biz1-stall", status: "paid" },
    create: {
      id: "seed-payment-biz1-stall", amount: 15000, currency: "INR", provider: "mock", providerOrderId: "seed-order-biz1-stall", status: "paid",
      baseAmount: 15000, organizerAmount: 15000, pricingVersionId: "pv-legacy-unversioned",
    },
  });
  await prisma.stallBooking.upsert({
    where: { id: "seed-stallbooking-biz1" },
    update: { stallId: "seed-stall-a01", exhibitionId: exhibition.id, buyerUserId: biz1Owner.id, exhibitionExhibitorId: participationBiz1.id, amountPaid: 15000, paymentStatus: "paid", paymentId: biz1StallPayment.id },
    create: { id: "seed-stallbooking-biz1", stallId: "seed-stall-a01", exhibitionId: exhibition.id, buyerUserId: biz1Owner.id, exhibitionExhibitorId: participationBiz1.id, amountPaid: 15000, paymentStatus: "paid", paymentId: biz1StallPayment.id },
  });

  const biz2StallPayment = await prisma.payment.upsert({
    where: { id: "seed-payment-biz2-stall" },
    update: { amount: 8000, currency: "INR", provider: "mock", providerOrderId: "seed-order-biz2-stall", status: "created" },
    create: {
      id: "seed-payment-biz2-stall", amount: 8000, currency: "INR", provider: "mock", providerOrderId: "seed-order-biz2-stall", status: "created",
      baseAmount: 8000, organizerAmount: 8000, pricingVersionId: "pv-legacy-unversioned",
    },
  });
  await prisma.stallBooking.upsert({
    where: { id: "seed-stallbooking-biz2" },
    update: { stallId: "seed-stall-a03", exhibitionId: exhibition.id, buyerUserId: biz2Owner.id, exhibitionExhibitorId: participationBiz2.id, amountPaid: 8000, paymentStatus: "created", paymentId: biz2StallPayment.id },
    create: { id: "seed-stallbooking-biz2", stallId: "seed-stall-a03", exhibitionId: exhibition.id, buyerUserId: biz2Owner.id, exhibitionExhibitorId: participationBiz2.id, amountPaid: 8000, paymentStatus: "created", paymentId: biz2StallPayment.id },
  });

  // ---------------------------------------------------------------------
  // VISITORS — 20 development visitor accounts
  // ---------------------------------------------------------------------
  const visitorNames = [
    "Aarav Sharma", "Vihaan Gupta", "Aditya Verma", "Ishaan Menon", "Ananya Pillai",
    "Diya Nair", "Myra Reddy", "Aadhya Bansal", "Kabir Joshi", "Reyansh Kulkarni",
    "Sai Krishnan", "Arjun Mathew", "Vivaan Shetty", "Aryan Bhat", "Kiara Fernandes",
    "Zara Hussain", "Anika Malhotra", "Navya Bose", "Riya Chatterjee", "Ira Ghosh",
  ];
  const visitors: Awaited<ReturnType<typeof upsertUser>>[] = [];
  for (let i = 0; i < visitorNames.length; i++) {
    const n = String(i + 1).padStart(2, "0");
    const visitor = await upsertUser({
      id: `seed-visitor-${n}`,
      email: `visitor${n}@${EMAIL_DOMAIN}`,
      fullName: visitorNames[i],
      phone: `9${(700000000 + i).toString()}`,
      userType: "visitor",
      passwordHash,
    });
    visitors.push(visitor);
  }

  // ---------------------------------------------------------------------
  // TICKETS — mixture of free/paid, unused/checked-in, and payment states
  // ---------------------------------------------------------------------
  type TicketDef = {
    id: string; visitorIdx: number; ticketTypeId: string; unitPrice: number;
    paymentStatus: "created" | "paid" | "failed" | "refunded"; paymentId: string;
  };
  const ticketDefs: TicketDef[] = [
    { id: "seed-ticket-01", visitorIdx: 0, ticketTypeId: ticketTypeGeneral.id, unitPrice: 0, paymentStatus: "paid", paymentId: "seed-payment-ticket-01" },
    { id: "seed-ticket-02", visitorIdx: 1, ticketTypeId: ticketTypeStandard.id, unitPrice: 499, paymentStatus: "paid", paymentId: "seed-payment-ticket-02" },
    { id: "seed-ticket-03", visitorIdx: 2, ticketTypeId: ticketTypeVip.id, unitPrice: 1999, paymentStatus: "paid", paymentId: "seed-payment-ticket-03" },
    { id: "seed-ticket-04", visitorIdx: 3, ticketTypeId: ticketTypeStandard.id, unitPrice: 499, paymentStatus: "paid", paymentId: "seed-payment-ticket-04" },
    { id: "seed-ticket-05", visitorIdx: 4, ticketTypeId: ticketTypeStandard.id, unitPrice: 499, paymentStatus: "created", paymentId: "seed-payment-ticket-05" },
    { id: "seed-ticket-06", visitorIdx: 5, ticketTypeId: ticketTypeGeneral.id, unitPrice: 0, paymentStatus: "paid", paymentId: "seed-payment-ticket-06" },
    { id: "seed-ticket-07", visitorIdx: 6, ticketTypeId: ticketTypeStandard.id, unitPrice: 499, paymentStatus: "failed", paymentId: "seed-payment-ticket-07" },
    { id: "seed-ticket-08", visitorIdx: 7, ticketTypeId: ticketTypeVip.id, unitPrice: 1999, paymentStatus: "paid", paymentId: "seed-payment-ticket-08" },
    { id: "seed-ticket-09", visitorIdx: 8, ticketTypeId: ticketTypeGeneral.id, unitPrice: 0, paymentStatus: "paid", paymentId: "seed-payment-ticket-09" },
    { id: "seed-ticket-10", visitorIdx: 9, ticketTypeId: ticketTypeStandard.id, unitPrice: 499, paymentStatus: "refunded", paymentId: "seed-payment-ticket-10" },
  ];

  const ticketBookings: Record<string, Awaited<ReturnType<typeof prisma.ticketBooking.upsert>>> = {};
  for (const t of ticketDefs) {
    const provider = t.unitPrice === 0 ? "free" : "mock";
    await prisma.payment.upsert({
      where: { id: t.paymentId },
      update: { amount: t.unitPrice, currency: "INR", provider, providerOrderId: t.unitPrice === 0 ? null : `seed-order-${t.id}`, status: t.paymentStatus, failureReason: t.paymentStatus === "failed" ? "Card declined (simulated)" : null },
      create: {
        id: t.paymentId, amount: t.unitPrice, currency: "INR", provider, providerOrderId: t.unitPrice === 0 ? null : `seed-order-${t.id}`, status: t.paymentStatus, failureReason: t.paymentStatus === "failed" ? "Card declined (simulated)" : null,
        baseAmount: t.unitPrice, organizerAmount: t.unitPrice, pricingVersionId: "pv-legacy-unversioned",
        refundedAmount: t.paymentStatus === "refunded" ? t.unitPrice : 0,
      },
    });
    const visitor = visitors[t.visitorIdx];
    ticketBookings[t.id] = await prisma.ticketBooking.upsert({
      where: { id: t.id },
      update: {
        exhibitionId: exhibition.id, ticketTypeId: t.ticketTypeId, buyerUserId: visitor.id,
        attendeeName: visitor.fullName, attendeeEmail: visitor.email, attendeePhone: visitor.phone,
        quantity: 1, unitPrice: t.unitPrice, amountPaid: t.paymentStatus === "paid" ? t.unitPrice : 0,
        paymentStatus: t.paymentStatus, paymentId: t.paymentId, visitDate: daysFrom(TODAY, 69),
      },
      create: {
        id: t.id, exhibitionId: exhibition.id, ticketTypeId: t.ticketTypeId, buyerUserId: visitor.id,
        attendeeName: visitor.fullName, attendeeEmail: visitor.email, attendeePhone: visitor.phone,
        quantity: 1, unitPrice: t.unitPrice, amountPaid: t.paymentStatus === "paid" ? t.unitPrice : 0,
        paymentStatus: t.paymentStatus, paymentId: t.paymentId, visitDate: daysFrom(TODAY, 69),
      },
    });
  }

  // ---------------------------------------------------------------------
  // CHECK-INS — normal scans + one override (re-entry) example
  // ---------------------------------------------------------------------
  await prisma.checkIn.upsert({
    where: { id: "seed-checkin-ticket02" },
    update: { ticketBookingId: ticketBookings["seed-ticket-02"].id, scannedByUserId: org1Scanner.id, method: "qr", isOverride: false },
    create: { id: "seed-checkin-ticket02", ticketBookingId: ticketBookings["seed-ticket-02"].id, scannedByUserId: org1Scanner.id, method: "qr", isOverride: false },
  });
  await prisma.checkIn.upsert({
    where: { id: "seed-checkin-ticket04-first" },
    update: { ticketBookingId: ticketBookings["seed-ticket-04"].id, scannedByUserId: org1Scanner.id, method: "qr", isOverride: false },
    create: { id: "seed-checkin-ticket04-first", ticketBookingId: ticketBookings["seed-ticket-04"].id, scannedByUserId: org1Scanner.id, method: "qr", isOverride: false },
  });
  await prisma.checkIn.upsert({
    where: { id: "seed-checkin-ticket04-override" },
    update: { ticketBookingId: ticketBookings["seed-ticket-04"].id, scannedByUserId: org1Admin.id, method: "manual", isOverride: true },
    create: { id: "seed-checkin-ticket04-override", ticketBookingId: ticketBookings["seed-ticket-04"].id, scannedByUserId: org1Admin.id, method: "manual", isOverride: true },
  });
  await prisma.checkIn.upsert({
    where: { id: "seed-checkin-ticket06" },
    update: { ticketBookingId: ticketBookings["seed-ticket-06"].id, scannedByUserId: org1Scanner.id, method: "qr", isOverride: false },
    create: { id: "seed-checkin-ticket06", ticketBookingId: ticketBookings["seed-ticket-06"].id, scannedByUserId: org1Scanner.id, method: "qr", isOverride: false },
  });
  await prisma.ticketBooking.update({ where: { id: ticketBookings["seed-ticket-02"].id }, data: { checkInStatus: true, checkInTime: daysFrom(TODAY, 69) } });
  await prisma.ticketBooking.update({ where: { id: ticketBookings["seed-ticket-04"].id }, data: { checkInStatus: true, checkInTime: daysFrom(TODAY, 69) } });
  await prisma.ticketBooking.update({ where: { id: ticketBookings["seed-ticket-06"].id }, data: { checkInStatus: true, checkInTime: daysFrom(TODAY, 69) } });

  // -- A webhook-idempotency example: the event that (in the real flow)
  // would have driven ticket 02's payment to "paid". --
  await prisma.paymentEvent.upsert({
    where: { id: "seed-payment-event-ticket02" },
    update: { paymentId: "seed-payment-ticket-02", provider: "mock", providerEventId: "seed-event-ticket02-captured", eventType: "payment.captured", payload: { simulated: true } as Prisma.InputJsonValue },
    create: { id: "seed-payment-event-ticket02", paymentId: "seed-payment-ticket-02", provider: "mock", providerEventId: "seed-event-ticket02-captured", eventType: "payment.captured", payload: { simulated: true } as Prisma.InputJsonValue },
  });

  // ---------------------------------------------------------------------
  // LEADS — one per status, varying priority/assignment/follow-up
  // ---------------------------------------------------------------------
  const leadDefs = [
    {
      id: "seed-lead-new", exhibitionExhibitorId: participationBiz1.id, status: "new", priority: "high",
      source: "manual", visitorName: "Neha Kulkarni", visitorEmail: `neha.kulkarni@${EMAIL_DOMAIN}`, visitorPhone: "9812340001",
      capturedByUserId: biz1Staff.id, assignedToUserId: null, followUpDate: null, notes: "Interested in robotics automation demo.",
    },
    {
      id: "seed-lead-contacted", exhibitionExhibitorId: participationBiz1.id, status: "contacted", priority: "medium",
      source: "qr_scan", ticketBookingId: ticketBookings["seed-ticket-02"].id,
      capturedByUserId: biz1Staff.id, assignedToUserId: biz1Admin.id, followUpDate: daysFrom(TODAY, 72), notes: "Initial call scheduled.",
    },
    {
      id: "seed-lead-interested", exhibitionExhibitorId: participationBiz1.id, status: "interested", priority: "high",
      source: "qr_scan", ticketBookingId: ticketBookings["seed-ticket-03"].id,
      capturedByUserId: biz1Admin.id, assignedToUserId: biz1Owner.id, followUpDate: daysFrom(TODAY, 70), notes: "Requested a product demo.",
    },
    {
      id: "seed-lead-negotiation", exhibitionExhibitorId: participationBiz2.id, status: "negotiation", priority: "medium",
      source: "manual", visitorName: "Rohan Iyer", visitorEmail: `rohan.iyer@${EMAIL_DOMAIN}`, visitorPhone: "9812340002",
      capturedByUserId: biz2Owner.id, assignedToUserId: biz2Owner.id, followUpDate: daysFrom(TODAY, 74), notes: "Discussing bulk order pricing.",
    },
    {
      id: "seed-lead-converted", exhibitionExhibitorId: participationBiz1.id, status: "converted", priority: "low",
      source: "qr_scan", ticketBookingId: ticketBookings["seed-ticket-06"].id,
      capturedByUserId: biz1Staff.id, assignedToUserId: biz1Staff.id, followUpDate: null, notes: "Signed a 1-year distribution agreement.",
    },
    {
      id: "seed-lead-lost", exhibitionExhibitorId: participationBiz1.id, status: "lost", priority: "low",
      source: "manual", visitorName: "Fatima Sheikh", visitorEmail: `fatima.sheikh@${EMAIL_DOMAIN}`, visitorPhone: "9812340003",
      capturedByUserId: biz1Admin.id, assignedToUserId: biz1Admin.id, followUpDate: null, notes: "Budget was cut this cycle; revisit next year.",
    },
  ] as const;

  const leads: Record<string, Awaited<ReturnType<typeof prisma.lead.upsert>>> = {};
  for (const l of leadDefs) {
    const data = {
      exhibitionExhibitorId: l.exhibitionExhibitorId,
      ticketBookingId: "ticketBookingId" in l ? l.ticketBookingId : null,
      visitorName: "visitorName" in l ? l.visitorName : null,
      visitorEmail: "visitorEmail" in l ? l.visitorEmail : null,
      visitorPhone: "visitorPhone" in l ? l.visitorPhone : null,
      source: l.source,
      capturedByUserId: l.capturedByUserId,
      assignedToUserId: l.assignedToUserId,
      status: l.status,
      priority: l.priority,
      notes: l.notes,
      followUpDate: l.followUpDate,
    };
    leads[l.id] = await prisma.lead.upsert({
      where: { id: l.id },
      update: data,
      create: { id: l.id, ...data },
    });
  }

  // ---------------------------------------------------------------------
  // ADDITIONAL PUBLIC EXHIBITIONS (UI-02) — seed-exhibition-1 was the only
  // live/public exhibition in this dataset, which isn't enough real variety
  // to demo a homepage with category/city/upcoming discovery sections (one
  // city, one category, one date). These are lightweight siblings — same
  // organizer, no stalls/exhibitor participations needed for the public
  // discovery surfaces — spanning different cities, categories and dates
  // (including one already-completed exhibition, to verify it's correctly
  // excluded from "live" listings).
  // ---------------------------------------------------------------------
  const extraExhibitionDefs = [
    {
      id: "seed-exhibition-2", name: "Mumbai Fashion Week Expo",
      category: "Fashion", city: "Mumbai", venue: "Bombay Exhibition Centre",
      // Real public coordinates for the actual named venue (Goregaon, Mumbai).
      latitude: 19.1636, longitude: 72.8497,
      description: "Runway showcases and trade stalls from India's leading fashion labels.",
      startOffset: 5, endOffset: 7, status: "live" as const,
      tickets: [{ id: "seed-tickettype-ex2-general", name: "General Entry", price: 0, quantity: 400 }, { id: "seed-tickettype-ex2-premium", name: "Premium Pass", price: 1499, quantity: 100 }],
    },
    {
      id: "seed-exhibition-3", name: "Delhi Food & Lifestyle Fair",
      category: "Food & Lifestyle", city: "Delhi", venue: "Pragati Maidan",
      // Real public coordinates for the actual named venue (Pragati Maidan, Delhi).
      latitude: 28.6139, longitude: 77.2431,
      description: "A weekend of regional cuisines, lifestyle brands, and artisan stalls.",
      startOffset: 20, endOffset: 22, status: "live" as const,
      tickets: [{ id: "seed-tickettype-ex3-general", name: "Day Pass", price: 299, quantity: 600 }],
    },
    {
      id: "seed-exhibition-4", name: "Hyderabad Healthcare Summit",
      category: "Healthcare", city: "Hyderabad", venue: "HITEX Exhibition Centre",
      // Real public coordinates for the actual named venue (HITEX, Hyderabad).
      latitude: 17.4344, longitude: 78.3826,
      description: "Medical technology, pharma, and healthcare services under one roof.",
      startOffset: 100, endOffset: 102, status: "live" as const,
      tickets: [{ id: "seed-tickettype-ex4-general", name: "General Entry", price: 199, quantity: 350 }, { id: "seed-tickettype-ex4-vip", name: "Delegate Pass", price: 2999, quantity: 40 }],
    },
    {
      id: "seed-exhibition-5", name: "Pune Education Fair 2026",
      category: "Education", city: "Pune", venue: "Pune International Convention Centre",
      // Real public coordinates for the actual named venue (Moshi, Pune).
      latitude: 18.6798, longitude: 73.8131,
      description: "Universities, ed-tech, and vocational training providers for prospective students.",
      startOffset: -35, endOffset: -33, status: "completed" as const,
      tickets: [{ id: "seed-tickettype-ex5-general", name: "General Entry", price: 0, quantity: 500 }],
    },
  ];
  for (const def of extraExhibitionDefs) {
    const ex = await prisma.exhibition.upsert({
      where: { id: def.id },
      update: {
        ownerId: org1Owner.id, organizerId: organizer1.id, name: def.name, category: def.category,
        description: def.description, venue: def.venue, city: def.city,
        latitude: def.latitude, longitude: def.longitude,
        startDate: daysFrom(TODAY, def.startOffset), endDate: daysFrom(TODAY, def.endOffset),
        status: def.status, visibility: "public",
      },
      create: {
        id: def.id, ownerId: org1Owner.id, organizerId: organizer1.id, name: def.name, category: def.category,
        description: def.description, venue: def.venue, city: def.city,
        latitude: def.latitude, longitude: def.longitude,
        startDate: daysFrom(TODAY, def.startOffset), endDate: daysFrom(TODAY, def.endOffset),
        status: def.status, visibility: "public",
      },
    });
    for (const t of def.tickets) {
      await prisma.ticketType.upsert({
        where: { id: t.id },
        update: { exhibitionId: ex.id, name: t.name, price: t.price, quantity: t.quantity, taxPercent: 18, visible: true },
        create: { id: t.id, exhibitionId: ex.id, name: t.name, price: t.price, quantity: t.quantity, taxPercent: 18, visible: true },
      });
    }
  }

  // ---------------------------------------------------------------------
  // AUDIT LOGS — a few realistic entries matching real action strings
  // ---------------------------------------------------------------------
  const auditDefs = [
    { id: "seed-audit-lead-captured", actorUserId: biz1Staff.id, action: "lead.captured", entityType: "Lead", entityId: leads["seed-lead-new"].id, metadata: { exhibitionExhibitorId: participationBiz1.id, source: "manual" } },
    { id: "seed-audit-lead-assigned", actorUserId: biz1Admin.id, action: "lead.assigned", entityType: "Lead", entityId: leads["seed-lead-contacted"].id, metadata: { assignedToUserId: biz1Admin.id } },
    { id: "seed-audit-lead-status", actorUserId: biz1Staff.id, action: "lead.status_changed", entityType: "Lead", entityId: leads["seed-lead-converted"].id, metadata: { from: "interested", to: "converted" } },
  ];
  for (const a of auditDefs) {
    await prisma.auditLog.upsert({
      where: { id: a.id },
      update: { actorUserId: a.actorUserId, action: a.action, entityType: a.entityType, entityId: a.entityId, metadata: a.metadata as Prisma.InputJsonValue },
      create: { id: a.id, actorUserId: a.actorUserId, action: a.action, entityType: a.entityType, entityId: a.entityId, metadata: a.metadata as Prisma.InputJsonValue },
    });
  }

  console.log("Seed complete.");
  console.log(`  Platform admin: ${platformAdmin.email}`);
  console.log(`  Organizer: ${organizer1.name} (${orgMemberships.length + 1} memberships)`);
  console.log(`  Exhibitor businesses: 4 (${exhibitorMemberships.length} memberships)`);
  console.log(`  Exhibition: ${exhibition.name}`);
  console.log(`  Visitors: ${visitors.length}`);
  console.log(`  Tickets: ${ticketDefs.length}`);
  console.log(`  Leads: ${leadDefs.length}`);
  console.log(`  All seed users share the password: ${DEV_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
