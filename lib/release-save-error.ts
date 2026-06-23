/** User-facing copy when a release insert may succeed on retry. */
export const RELEASE_SAVE_ERROR_RETRY =
  "Could not save release. Please try again. If this keeps happening, contact your platform admin.";

/** User-facing copy when retry is unlikely to help. */
export const RELEASE_SAVE_ERROR_FATAL =
  "Could not save release. Internal error. Please contact your platform admin and don't retry.";

export interface ClassifiableDbError {
  code?: string | null;
  message?: string | null;
}

/**
 * Postgres SQLSTATE classes / codes that retry won't fix.
 * 22xxx = data exception (overflow, invalid cast, …)
 * 23xxx = integrity constraint violation
 */
const PERSISTENT_POSTGRES_PREFIXES = ["22", "23"] as const;

/**
 * Explicit codes where a retry might succeed (network, pool, JWT expiry, RLS/auth blips).
 * Not exhaustive. Unknown codes default to fatal (conservative).
 */
const RETRIABLE_ERROR_CODES = new Set<string>([
  // PostgREST connection / pool failures
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
  // JWT expired. Session refresh may recover on retry
  "PGRST301",
  // Postgres connection / availability
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "57P01",
  "57P03",
  // insufficient_privilege. Often RLS or expired auth; user asked to treat as retriable
  "42501",
]);

function messageLooksTransient(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("connection") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("socket")
  );
}

function isPersistentPostgresCode(code: string): boolean {
  return PERSISTENT_POSTGRES_PREFIXES.some((prefix) => code.startsWith(prefix));
}

export function isRetriableDbError(error: ClassifiableDbError): boolean {
  const code = (error.code ?? "").trim();
  const message = (error.message ?? "").trim();

  if (code && isPersistentPostgresCode(code)) {
    return false;
  }

  if (code && RETRIABLE_ERROR_CODES.has(code)) {
    return true;
  }

  if (message && messageLooksTransient(message)) {
    return true;
  }

  return false;
}

export function releaseSaveErrorMessage(error: ClassifiableDbError): string {
  console.error("Release save error:", error);
  return isRetriableDbError(error)
    ? RELEASE_SAVE_ERROR_RETRY
    : RELEASE_SAVE_ERROR_FATAL;
}
