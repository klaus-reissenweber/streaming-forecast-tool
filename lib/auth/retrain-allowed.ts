/**
 * Narrower allowlist for enqueueing retrain jobs.
 * Falls back to AUTH_ALLOWED_EMAILS when RETRAIN_ALLOWED_EMAILS is unset.
 */

function parseEmailList(raw: string): string[] {
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function retrainAllowedEmails(): string[] {
  const specific = parseEmailList(process.env.RETRAIN_ALLOWED_EMAILS ?? "");
  if (specific.length > 0) {
    return specific;
  }
  return parseEmailList(process.env.AUTH_ALLOWED_EMAILS ?? "");
}

export function canRetrain(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const allowed = retrainAllowedEmails();
  if (allowed.length === 0) {
    return false;
  }
  return allowed.includes(email.trim().toLowerCase());
}
