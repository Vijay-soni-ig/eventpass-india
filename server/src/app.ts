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
// import and exercise real HTTP routes in-process without also starting
// a second server on the same port. index.ts remains the only place that
// calls .listen() — this file has no side effect beyond building the app.
export const app = express();

// Production API hardening. Browser origins must be explicitly allowlisted
// in production; local development remains permissive unless CORS_ORIGINS is
// supplied. Non-browser clients without an Origin header are unaffected.
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsOrigins.length === 0) {
        if (process.env.NODE_ENV === "production") {
          return callback(new Error("CORS origin is not configured"));
        }
        return callback(null, true);
      }
      return callback(null, corsOrigins.includes(origin));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Mock-Signature"],
    credentials: false,
    maxAge: 600,
  })
);

// Security headers are applied to API responses. CSP is deliberately strict
// because this server is an API, not the frontend document origin.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Webhook signature verification needs the exact raw bytes the gateway signed.
// This MUST be mounted before express.json(), otherwise the signature can no
// longer be verified against the provider's original request bytes.
app.use(
  "/api/webhooks/payments",
  express.raw({ type: "*/*", limit: "100kb" }),
  paymentWebhooksRouter
);

// Bound JSON payloads to limit accidental or abusive memory consumption.
// Multipart uploads have their own size/type limits in middleware/upload.ts.
app.use(express.json({ limit: "1mb" }));

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
  // express.json()/express.raw() reject malformed or oversized bodies with a
  // 4xx status; preserve that status rather than flattening a client mistake
  // into a generic 500. Never expose stack traces or internal error details.
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : 500;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: "Invalid request" });
  }
  res.status(500).json({ error: "Internal server error" });
});
