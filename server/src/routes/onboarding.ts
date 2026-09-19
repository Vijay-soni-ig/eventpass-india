import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getRoleContext } from "../lib/access";
import { getOnboardingSummary } from "../lib/onboarding";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const roles = await getRoleContext(req.user!);
  const onboarding = await getOnboardingSummary(req.user!, roles);
  res.json({ onboarding });
});

export default router;
