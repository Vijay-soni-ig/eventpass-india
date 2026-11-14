/**
 * Escape a CSV cell and neutralize spreadsheet formula injection.
 *
 * Prefixing formula-like values with an apostrophe makes visitor-controlled
 * text inert when an exported CSV is opened in common spreadsheet software.
 */
export function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe = /^[\\u0000-\\u0020]*[=+\\-@]/.test(raw) ? "'" + raw : raw;
  return "\"" + safe.replace(/"/g, '""') + "\"";
}
