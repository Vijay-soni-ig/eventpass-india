const API_URL = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "eventpass_token";
export const ACTIVE_EXHIBITOR_BUSINESS_KEY = "exhibittix_active_exhibitor_business_id";

export function getActiveExhibitorBusinessId(): string | null {
  return localStorage.getItem(ACTIVE_EXHIBITOR_BUSINESS_KEY);
}

export function setActiveExhibitorBusinessId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_EXHIBITOR_BUSINESS_KEY, id);
  else localStorage.removeItem(ACTIVE_EXHIBITOR_BUSINESS_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    setActiveExhibitorBusinessId(null);
  }
}

export class ApiError extends Error {
  status: number;
  /** Present when the server returned a structured error body (e.g. Phase 20C's `{error: {code, message, resource, currentUsage, limit, plan, action}}` entitlement shape) instead of the older plain `{error: "string"}` shape — lets a caller branch on `.code`/`.action` for richer handling, while `.message` always stays a sensible display string either way. */
  details?: Record<string, unknown>;
  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const activeExhibitorBusinessId = getActiveExhibitorBusinessId();
  const usesBusinessContext = path.startsWith("/api/business") || path.startsWith("/api/documents");
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(usesBusinessContext && activeExhibitorBusinessId ? { "X-Exhibitor-Business-Id": activeExhibitorBusinessId } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = res.statusText;
    let details: Record<string, unknown> | undefined;
    try {
      const body = await res.json();
      if (typeof body.error === "string") {
        message = body.error;
      } else if (body.error && typeof body.error === "object") {
        // Structured error shape (e.g. Phase 20C entitlement errors):
        // {error: {code, message, resource, currentUsage, limit, plan, action}}.
        message = typeof body.error.message === "string" ? body.error.message : message;
        details = body.error;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

async function requestBlob(path: string): Promise<Blob> {
  const token = getToken();
  const activeExhibitorBusinessId = getActiveExhibitorBusinessId();
  const usesBusinessContext = path.startsWith("/api/business") || path.startsWith("/api/documents");
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(usesBusinessContext && activeExhibitorBusinessId ? { "X-Exhibitor-Business-Id": activeExhibitorBusinessId } : {}),
  };
  const response = await fetch(`${API_URL}${path}`, { method: "GET", headers });
  if (!response.ok) {
    let message = response.statusText || "Download failed";
    try {
      const body = await response.json();
      if (typeof body.error === "string") message = body.error;
      else if (body.error && typeof body.error.message === "string") message = body.error.message;
    } catch {
      // Keep the HTTP status message when the server response is not JSON.
    }
    throw new ApiError(response.status, message);
  }
  return response.blob();
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { method: "GET", headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
