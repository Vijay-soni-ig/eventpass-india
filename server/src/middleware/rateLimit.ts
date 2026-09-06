import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

// Phase 22.1 hardening — a shared factory on top of the same
// express-rate-limit dependency routes/auth.ts already uses (no second
// rate-limiting architecture). Keyed by authenticated user id when
// available, not just IP: these routes all run after requireAuth, so an
// attacker cannot bypass a per-account limit by rotating client-side state
// (a new token still carries the same real userId once a real account is
// behind it) — only a genuinely new account or IP gets a fresh bucket.
// Falls back to ipKeyGenerator (IPv6-safe) for the rare case a route using
// this is reached without req.user set.
function keyByUserOrIp(req: Request): string {
  return req.user?.id ?? ipKeyGenerator(req.ip ?? "");
}

/** Mutations that change shared/public state but aren't spam-prone by nature — profile edits, social link CRUD. */
export const profileMutationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many profile changes. Please try again later." },
});

/** Image uploads — more expensive per-request (disk I/O, 5MB body) than a plain JSON PUT. */
export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many uploads. Please try again later." },
});

/** Follow/unfollow — a visitor toggling this legitimately (double-click, rapid browsing) is common, so the window is short and the cap generous; it's still enough to stop a scripted follow-count inflation attack. */
export const followRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many follow/unfollow requests. Please try again shortly." },
});

/**
 * Phase 22.4 — public discovery/search (GET /api/public/discover). Always
 * IP-keyed (never keyByUserOrIp): this route runs before any auth
 * middleware and is intended for anonymous browsing, so there is no
 * req.user to key by in the common case. The limit is deliberately
 * generous (debounced typing + pagination clicks from one real visitor can
 * easily be 20-30 requests/minute) — this exists to stop scripted scraping/
 * abuse, not to make normal discovery feel rate-limited.
 */
export const publicSearchRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  message: { error: "Too many search requests. Please try again shortly." },
});

/**
 * Phase 23.1 — the funnel audit found booking creation (POST
 * /api/bookings/tickets) and payment verification (POST
 * /api/payments/:id/verify) had NO rate limiting at all, unlike every other
 * mutation route in this codebase. Both sit directly in front of real
 * inventory (assertTicketTypeHasStock) and a real payment gateway — a
 * scripted flood is exactly the "expensive/payment-sensitive endpoint" the
 * project's own rate-limit convention already exists to protect. Limits are
 * generous enough that a real visitor retrying a failed/pending payment a
 * few times, or a household booking several ticket types back-to-back,
 * never notices them; existing idempotency (Idempotency-Key header,
 * PaymentGatewayDialog's own retry path) is untouched — this only bounds
 * request VOLUME, never request correctness.
 */
export const bookingCreationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many booking attempts. Please wait a few minutes and try again." },
});

export const paymentVerifyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many payment verification attempts. Please wait a few minutes and try again." },
});

/** Phase 23.3 — event save/unsave. Same shape as followRateLimit (a visitor toggling this legitimately is common), kept as its own bucket rather than sharing followRateLimit's instance so a burst of one action never eats into the other's allowance. */
export const saveExhibitionRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many save/unsave requests. Please try again shortly." },
});

/** Phase 23.5 — the audit found routes/exhibitions.ts (create/update/delete/duplicate/publish, plus ticket/stall/exhibitor-review sub-routes) had NO rate limiting at all, unlike every other mutation-heavy route file in this codebase. Same shape as profileMutationRateLimit (organizer-authored form saves, not spam-prone by nature, so a short window with a generous cap). */
export const exhibitionMutationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many exhibition changes. Please wait a few minutes and try again." },
});
