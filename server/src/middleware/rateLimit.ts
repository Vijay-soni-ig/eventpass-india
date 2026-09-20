import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

function keyByUserOrIp(req: Request): string {
  return req.user?.id ?? ipKeyGenerator(req.ip ?? "");
}

export const profileMutationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many profile changes. Please try again later." } });
export const uploadRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many uploads. Please try again later." } });
export const followRateLimit = rateLimit({ windowMs: 5 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many follow/unfollow requests. Please try again shortly." } });
export const publicSearchRateLimit = rateLimit({ windowMs: 5 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""), message: { error: "Too many search requests. Please try again shortly." } });
export const bookingCreationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many booking attempts. Please wait a few minutes and try again." } });
export const paymentVerifyRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many payment verification attempts. Please wait a few minutes and try again." } });
export const saveExhibitionRateLimit = rateLimit({ windowMs: 5 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many save/unsave requests. Please try again shortly." } });
export const exhibitionMutationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many exhibition changes. Please wait a few minutes and try again." } });
export const eventMutationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many event changes. Please wait a few minutes and try again." } });
export const eventTicketCheckInRateLimit = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp, message: { error: "Too many check-in requests. Please slow down and try again shortly." } });
export const registrationCreationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""), message: { error: "Too many registration attempts. Please wait a few minutes and try again." } });

/** Event-native ticket reservations consume scarce inventory; keep this separate from payment/order limits. */
export const eventTicketReservationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many ticket reservation attempts. Please wait a few minutes and try again." },
});

/** Event-native order creation creates a payment intent/gateway order and is therefore more expensive than ordinary authenticated reads. */
export const eventTicketOrderRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many ticket order attempts. Please wait a few minutes and try again." },
});
