import { Router } from "express";
import { z } from "zod";
import { calculatePricing } from "../lib/pricingEngine";

const router = Router();

// Public, unauthenticated — pure calculation against a server-computed base
// amount the caller already knows (a ticket type's price × quantity, or a
// stall's price), never against tenant data. This is informational only:
// the frontend uses it to display an accurate price BEFORE creating a
// booking, but booking/payment creation always recalculates independently
// via the exact same calculatePricing() function — this endpoint's response
// is never trusted as the actual charge amount. See
// docs/PHASE_19A_COMMERCIAL_FOUNDATION_REPORT.md.
const quoteQuerySchema = z.object({
  baseAmount: z.coerce.number().min(0),
});

router.get("/quote", async (req, res) => {
  const parsed = quoteQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const breakdown = await calculatePricing(parsed.data.baseAmount);
  res.json({ breakdown });
});

export default router;
