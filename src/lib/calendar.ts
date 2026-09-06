// Phase 24 — "Add to Calendar" as a plain client-generated .ics file. No new
// backend/calendar-provider integration exists or is needed: every field
// used here (name/venue/city/startDate/endDate) already comes back from the
// existing public exhibition-detail endpoint.
function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function downloadExhibitionIcs(exhibition: {
  id: string;
  name: string;
  venue: string | null;
  city: string | null;
  startDate: string | null;
  endDate: string | null;
}) {
  if (!exhibition.startDate) return;
  const start = new Date(exhibition.startDate);
  const end = exhibition.endDate ? new Date(exhibition.endDate) : start;
  const location = [exhibition.venue, exhibition.city].filter(Boolean).join(", ");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ExhibitTix//Event//EN",
    "BEGIN:VEVENT",
    `UID:${exhibition.id}@exhibittix.com`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${exhibition.name.replace(/\n/g, " ")}`,
    location ? `LOCATION:${location.replace(/\n/g, " ")}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${exhibition.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
