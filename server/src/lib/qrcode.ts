import QRCode from "qrcode";

/**
 * Renders a scannable QR image encoding only the opaque ticket token
 * (TicketBooking.qrCode — a random UUID) — never attendee name, email, or
 * any other identifying detail. Anyone who intercepts the image learns
 * nothing beyond "this is some ticket token"; looking up who it belongs to
 * still requires organizer-scoped API access (see GET /tickets/lookup/:qrCode).
 */
export async function generateQrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}
