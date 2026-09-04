import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import authRouter from "./routes/auth";
import businessRouter from "./routes/business";
import teamMembersRouter from "./routes/teamMembers";
import organizerMembersRouter from "./routes/organizerMembers";
import exhibitorMembersRouter from "./routes/exhibitorMembers";
import exhibitionsRouter from "./routes/exhibitions";
import bookingsRouter from "./routes/bookings";
import exhibitorParticipationsRouter from "./routes/exhibitorParticipations";
import organizerPaymentsRouter from "./routes/organizerPayments";
import paymentsRouter from "./routes/payments";
import paymentWebhooksRouter from "./routes/paymentWebhooks";
import documentsRouter from "./routes/documents";
import platformRouter from "./routes/platform";
import publicRouter from "./routes/public";

const app = express();

app.use(cors());

// Webhook signature verification needs the exact raw bytes the gateway
// signed, so this is mounted with a raw-body parser BEFORE the global JSON
// parser below — re-serializing an already-parsed JSON object would change
// the byte sequence and silently break every signature check.
app.use("/api/webhooks/payments", express.raw({ type: "*/*" }), paymentWebhooksRouter);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/business", businessRouter);
app.use("/api/team-members", teamMembersRouter);
app.use("/api/organizer-members", organizerMembersRouter);
app.use("/api/exhibitor-members", exhibitorMembersRouter);
app.use("/api/exhibitions", exhibitionsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/exhibitor/participations", exhibitorParticipationsRouter);
app.use("/api/organizer/payments", organizerPaymentsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/platform", platformRouter);
app.use("/api/public", publicRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
