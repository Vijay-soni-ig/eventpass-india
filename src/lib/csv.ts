function escapeCsvValue(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  let firstMeaningfulIndex = 0;

  // Spreadsheet applications may ignore leading ASCII controls/whitespace or a BOM
  // when deciding whether a cell starts with a formula.
  while (firstMeaningfulIndex < raw.length) {
    const codePoint = raw.codePointAt(firstMeaningfulIndex)!;
    const character = String.fromCodePoint(codePoint);
    if (codePoint <= 0x20 || codePoint === 0xfeff || /\\s/u.test(character)) {
      firstMeaningfulIndex += character.length;
      continue;
    }
    break;
  }

  const firstMeaningfulCharacter = raw[firstMeaningfulIndex];
  const isFormula =
    firstMeaningfulCharacter === "=" ||
    firstMeaningfulCharacter === "+" ||
    firstMeaningfulCharacter === "-" ||
    firstMeaningfulCharacter === "@";
  const safe = isFormula ? "'" + raw : raw;

  // Quote every cell (not only cells containing delimiters) and double embedded
  // quotes so commas, quotes, CR/LF and Unicode remain valid CSV data.
  return "\"" + safe.replace(/"/g, '""') + "\"";
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T; label: string }[]): string {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
