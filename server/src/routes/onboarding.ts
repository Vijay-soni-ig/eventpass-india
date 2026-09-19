import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getRoleContext } from "../lib/access";
import { getOnboardingSummary } from "../lib/onboarding";
import { resolveExhibitorBusinessId } from "../lib/exhibitorBusiness";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  let roles = await getRoleContext(req.user!);
  if (req.user!.userType === "exhibitor" && roles.exhibitor.length === 0) {
    await resolveExhibitorBusinessId(req.user!.id);
    roles = await getRoleContext(req.user!);
  }
  const onboarding = await getOnboardingSummary(req.user!, roles);
  res.json({ onboarding });
});

export default router;
