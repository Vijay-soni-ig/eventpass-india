/**
 * Escape a CSV cell and neutralize spreadsheet formula injection.
 *
 * Prefixing formula-like values with an apostrophe makes visitor-controlled
 * text inert when an exported CSV is opened in common spreadsheet software.
 */
export function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? "");
  let firstMeaningfulIndex = 0;

  // Avoid a control-character regular expression so this helper passes
  // ESLint's no-control-regex rule while still skipping ASCII controls/spaces.
  while (
    firstMeaningfulIndex < raw.length &&
    raw.charCodeAt(firstMeaningfulIndex) <= 0x20
  ) {
    firstMeaningfulIndex += 1;
  }

  const firstMeaningfulCharacter = raw[firstMeaningfulIndex];
  const isFormula =
    firstMeaningfulCharacter === "=" ||
    firstMeaningfulCharacter === "+" ||
    firstMeaningfulCharacter === "-" ||
    firstMeaningfulCharacter === "@";
  const safe = isFormula ? "'" + raw : raw;

  return "\"" + safe.replace(/"/g, '""') + "\"";
}
