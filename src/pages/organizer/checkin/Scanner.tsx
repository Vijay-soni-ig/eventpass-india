import Scanner from "@/pages/exhibitor/scanner/Scanner";

// Check-in scanning is an organizer-side activity (gated by the
// organizer-only `scanner:use` / `checkin:override` permissions), so it's
// mounted under /organizer/checkin. The shared QR/manual scanning UI lives
// at pages/exhibitor/scanner/Scanner.tsx — reused here rather than
// duplicated, but pointed at the organizer's own exhibitions and the
// organizer-axis lookup/check-in endpoints via `context="organizer"`
// (UI-01D fix: this previously rendered the component with no context,
// which defaulted it to the EXHIBITOR data scope — an organizer scanner has
// no exhibitor participations, so the exhibition selector was always empty).
export default function OrganizerScanner() {
  return <Scanner context="organizer" />;
}
