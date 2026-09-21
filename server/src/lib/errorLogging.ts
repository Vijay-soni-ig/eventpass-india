export type ErrorLogContext = {
  requestId: string | number | null;
  method: string;
  path: string;
  status: number;
  errorName: string;
  errorMessage: string;
  stack?: string;
};

/**
 * Keep production error logs useful for correlation without copying arbitrary
 * exception messages or stacks into the log stream. Database drivers,
 * upstream SDKs, and validation libraries may include request data or other
 * sensitive values in their error text.
 */
export function buildErrorLog(context: ErrorLogContext, isProduction: boolean): Record<string, unknown> {
  const base = {
    event: "http_request_error",
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    status: context.status,
    errorName: context.errorName,
  };

  if (isProduction) return base;

  return {
    ...base,
    errorMessage: context.errorMessage,
    stack: context.stack,
  };
}
