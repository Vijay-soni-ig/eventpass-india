import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import authRouter from "./routes/auth";
import businessRouter from "./routes/business";
import organizerMembersRouter from "./routes/organizerMembers";
import exhibitorMembersRouter from "./routes/exhibitorMembers";
import exhibitionsRouter from "./routes/exhibitions";
import exhibitionContentRouter from "./routes/exhibitionContent";
import bookingsRouter from "./routes/bookings";
import exhibitorParticipationsRouter from "./routes/exhibitorParticipations";
import exhibitorScannerRouter from "./routes/exhibitorScanner";
import organizerPaymentsRouter from "./routes/organizerPayments";
import paymentsRouter from "./routes/payments";
import paymentWebhooksRouter from "./routes/paymentWebhooks";
import documentsRouter from "./routes/documents";
import leadsRouter from "./routes/leads";
import organizerLeadsRouter from "./routes/organizerLeads";
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

// Express 4 does not route a rejected promise thrown inside an async route
// handler to the error middleware below — left unhandled, Node's default
// unhandledRejection policy terminates the whole process, letting any single
// authenticated request (e.g. an unparseable date reaching a Prisma call)
// take down every tenant. Registering a listener suppresses that default
// termination; the error still surfaces via the same generic 500 handler
// each route's own try/catch (or lack thereof) would otherwise miss.
//
// Guarded so importing this module multiple times (e.g. once from index.ts,
// once from an automated test file) doesn't register the listener twice.
if (process.listenerCount("unhandledRejection") === 0) {
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });
}

// The configured Express app, exported separately from index.ts's
// app.listen() call so Phase 19A's automated tests (server/tests/) can
// import and exercise real HTTP routes in-process without also starting a
// second server on the same port. index.ts remains the only place that
// calls .listen() — this file has no side effect beyond building the app.
export const app = express();

app.use(cors());

// Webhook signature verification needs the exact raw bytes the gateway
// signed, so this is mounted with a raw-body parser BEFORE the global JSON
// parser below — re-serializing an already-parsed JSON object would change
// the byte sequence and silently break every signature check.
app.use("/api/webhooks/payments", express.raw({ type: "*/*" }), paymentWebhooksRouter);

app.use(express.json());
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads"), {
    // Defense in depth alongside the upload allowlist in middleware/upload.ts:
    // even for the now-restricted set of file types, never let a browser
    // sniff/execute content as something other than what its extension says.
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/business", businessRouter);
app.use("/api/organizer-members", organizerMembersRouter);
app.use("/api/exhibitor-members", exhibitorMembersRouter);
app.use("/api/exhibitions", exhibitionsRouter);
app.use("/api/exhibitions", exhibitionContentRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/exhibitor/participations", exhibitorParticipationsRouter);
app.use("/api/exhibitor/scanner", exhibitorScannerRouter);
app.use("/api/organizer/payments", organizerPaymentsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/organizer/leads", organizerLeadsRouter);
app.use("/api/organizer/analytics", organizerAnalyticsRouter);
app.use("/api/organizer/subscription", organizerSubscriptionRouter);
app.use("/api/organizer/profile", organizerProfileRouter);
app.use("/api/organizer/gallery", organizerGalleryRouter);
app.use("/api/organizers", organizerFollowsRouter);
app.use("/api/saved-exhibitions", savedExhibitionsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/platform", platformRouter);
app.use("/api/public", publicRouter);
app.use("/api/pricing", pricingRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  // express.json() rejects a malformed body with a SyntaxError carrying its
  // own 4xx `status` (e.g. entity.parse.failed) — that's a client mistake,
  // not a server failure, and should surface as the 400 it already is
  // rather than being flattened into a generic 500.
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : 500;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: "Invalid request" });
  }
  res.status(500).json({ error: "Internal server error" });
});
