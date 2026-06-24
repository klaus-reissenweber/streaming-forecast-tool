function parseAllowedEmails(): string[] {
  const raw = process.env.AUTH_ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const allowed = parseAllowedEmails();
  if (allowed.length === 0) {
    return false;
  }
  return allowed.includes(email.trim().toLowerCase());
}

export function allowedEmailsConfigured(): boolean {
  return parseAllowedEmails().length > 0;
}
