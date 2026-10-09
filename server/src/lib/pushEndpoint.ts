/**
 * Web Push endpoints are later contacted by the server-side delivery worker.
 * Accept only the browser push-service origins used by our supported browsers;
 * accepting arbitrary HTTPS URLs would expose the worker to SSRF.
 *
 * Keep this allowlist aligned with supported browser push providers. Hostnames
 * are matched exactly (not by substring/suffix) to reject lookalike domains.
 */
const ALLOWED_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:"
      && endpoint.username === ""
      && endpoint.password === ""
      && endpoint.port === ""
      && ALLOWED_PUSH_HOSTS.has(endpoint.hostname.toLowerCase());
  } catch {
    return false;
  }
}
