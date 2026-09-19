import { Router } from "express";
import QRCode from "qrcode";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { buildQrPayload, getEventTicketByQrPayload } from "../lib/eventTicketIssuance";

const router = Router();
router.use(requireAuth);

import { Router } from "express";
import { createHmac } from "crypto";
import QRCode from "qrcode";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { buildQrPayload, getEventTicketByQrPayload } from "../lib/eventTicketIssuance";

const router = Router();
router.use(requireAuth);

function qrTokenForTicket(id: string, ticketCode: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for QR ticket signing");
  return createHmac("sha256", secret).update(id + "." + ticketCode).digest("base64url");
}

function qrPayloadForTicket(id: string, ticketCode: string) {
  return "ETX1." + ticketCode + "." + qrTokenForTicket(id, ticketCode);
}

