/**
 * Returns `url` only when it is safe to put in an `href`: an absolute http(s) link, or mailto: / tel:.
 * Anything else (`javascript:`, `data:`, `vbscript:`, a scheme hidden behind whitespace or control
 * characters, ...) gives undefined, so the link is rendered without a destination instead of running
 * a script. The API rejects such values on write; this also covers any already stored.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) if (value.charCodeAt(i) < 32) return true;
  return false;
}

export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const value = url.trim();
  if (!value || hasControlCharacter(value)) return undefined;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:" ? value : undefined;
  } catch {
    return undefined;
  }
}
