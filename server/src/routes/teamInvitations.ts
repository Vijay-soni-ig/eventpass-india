import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { profileMutationRateLimit } from "../middleware/rateLimit";
import { acceptInvitation, findInvitationByToken } from "../lib/teamInvitations";

const router = Router();

router.get("/:token", async (req, res) => {
  const token = z.string().min(32).max(128).safeParse(req.params.token);
  if (!token.success) return res.status(400).json({ error: "Invalid invitation token" });
  const found = await findInvitationByToken(token.data);
  if (!found || found.membership.status !== "invited") return res.status(404).json({ error: "Invitation not found or already accepted" });
  if (found.membership.invitationExpiresAt && found.membership.invitationExpiresAt.getTime() < Date.now()) {
    return res.status(410).json({ error: "Invitation has expired" });
  }
  res.json({
    kind: found.kind,
    email: found.membership.invitedEmail,
    role: found.membership.role,
    expiresAt: found.membership.invitationExpiresAt,
  });
});

router.post("/accept", requireAuth, profileMutationRateLimit, async (req, res) => {
  const parsed = z.object({ token: z.string().min(32).max(128) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid invitation token" });
  try {
    const membership = await acceptInvitation(parsed.data.token, req.user!.id, req.user!.email);
    res.json({ membership });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unable to accept invitation" });
  }
});

export default router;
