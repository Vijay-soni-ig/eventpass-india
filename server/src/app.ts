import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import storageRouter from "./routes/storage";
import { assertProductionStorageConfig, isS3Storage } from "./lib/storage";
import { prisma } from "./lib/prisma";
import { createRequestId } from "./lib/requestId";
import { buildErrorLog } from "./lib/errorLogging";
import authRouter from "./routes/auth";
import businessRouter from "./routes/business";
import organizerMembersRouter from "./routes/organizerMembers";
import exhibitorMembersRouter from "./routes/exhibitorMembers";
import exhibitionsRouter from "./routes/exhibitions";
import eventsRouter from "./routes/events";
import eventParticipantsRouter from "./routes/eventParticipants";
import eventSpeakersRouter from "./routes/eventSpeakers";
import eventSponsorsRouter from "./routes/eventSponsors";
import eventVendorsRouter from "./routes/eventVendors";
import eventPartnersRouter from "./routes/eventPartners";
import eventCategoriesRouter from "./routes/eventCategories";
import eventCategoryReadRouter from "./routes/eventCategoryRead";
import exhibitionContentRouter from "./routes/exhibitionContent";
import floorPlanLayoutRouter from "./routes/floorPlanLayout";
import bookingsRouter from "./routes/bookings";
import exhibitorParticipationsRouter from "./routes/exhibitorParticipations";
import exhibitorScannerRouter from "./routes/exhibitorScanner";
import organizerPaymentsRouter from "./routes/organizerPayments";
import paymentsRouter from "./routes/payments";
import paymentWebhooksRouter from "./routes/paymentWebhooks";
import documentsRouter from "./routes/documents";
import leadsRouter from "./routes/leads";
import organizerLeadsRouter from "./routes/organizerLeads";
import eventLeadsRouter from "./routes/eventLeads";
import eventLeadCaptureContextsRouter from "./routes/eventLeadCaptureContexts";
import organizerAnalyticsRouter from "./routes/organizerAnalytics";
import organizerSubscriptionRouter from "./routes/organizerSubscription";
import organizerProfileRouter from "./routes/organizerProfile";
import organizerGalleryRouter from "./routes/organizerGallery";
import organizerFollowsRouter from "./routes/organizerFollows";
import savedExhibitionsRouter from "./routes/savedExhibitions";
import notificationsRouter from "./routes/notifications";
import platformRouter from "./routes/platform";
import publicRouter from "./routes/public";
import pricingRouter from "./routes/pricing";
import onboardingRouter from "./routes/onboarding";
import registrationsRouter from "./routes/registrations";
import organizerRegistrationsRouter from "./routes/organizerRegistrations";
import eventTicketsRouter from "./routes/eventTickets";
import eventTicketOrdersRouter from "./routes/eventTicketOrders";
import eventTicketReservationsRouter from "./routes/eventTicketReservations";
import eventTicketsIssuedRouter from "./routes/eventTicketsIssued";
import eventTicketCheckInRouter from "./routes/eventTicketCheckIn";
import organizerEventAnalyticsRouter from "./routes/organizerEventAnalytics";

if (process.listenerCount("unhandledRejection") === 0) {
  process.on("unhandledRejection", (reason) => console.error("Unhandled promise rejection:", reason));
}

function getCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
}

assertProductionStorageConfig();

if (process.env.NODE_ENV === "production" && getCorsOrigins().length === 0) {
  throw new Error("CORS_ORIGINS must be configured in production");
}

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = getCorsOrigins();
    if (!origin || allowedOrigins.length === 0) return callback(null, true);
    return callback(null, allowedOrigins.includes(origin));
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
