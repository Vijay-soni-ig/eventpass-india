const EVENT_PATH_PREFIX = "/event";

export function getPublicEventPath(eventId: string): string {
  const normalizedId = eventId.trim();
  if (!normalizedId) {
    throw new Error("Event ID is required to build a public event URL.");
  }

  return `${EVENT_PATH_PREFIX}/${encodeURIComponent(normalizedId)}`;
}

export function getPublicEventUrl(eventId: string): string {
  return getPublicEventPath(eventId);
}

export function isCanonicalEventPath(pathname: string): boolean {
  return /^\/event\/[^/]+$/.test(pathname);
}
