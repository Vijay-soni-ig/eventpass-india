import { z } from "zod";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) if (value.charCodeAt(i) < 32) return true;
  return false;
}

/**
 * Returns an absolute http(s) URL, or null when the value is not one. Zod's own `.url()` accepts any
 * scheme (`javascript:`, `data:`, `vbscript:`), which becomes a script when the value is rendered as a
 * link, so link fields use this instead. A bare address such as `example.com` is accepted and gets `https://`.
 */
export function normalizeHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/.test(value) || hasControlCharacter(value)) return null;
  const hasScheme = HAS_SCHEME.test(value);
  // Protocol-relative values ("//host" or a leading backslash) would look valid once https:// is prefixed.
  if (!hasScheme && (value.startsWith("/") || value.startsWith(String.fromCharCode(92)))) return null;
  const candidate = hasScheme ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return null;
  return candidate;
}

/** A required http(s) link of at most `maxLength` characters. */
export function httpUrl(maxLength = 2000) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .transform((value, ctx) => {
      const normalized = normalizeHttpUrl(value);
      if (!normalized) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a web address starting with http:// or https://" });
        return z.NEVER;
      }
      return normalized;
    });
}

/** Like `httpUrl`, but an empty string is allowed (used by fields where blank clears the value). */
export function httpUrlOrEmpty(maxLength = 2000) {
  return z.union([z.literal(""), httpUrl(maxLength)]);
}
