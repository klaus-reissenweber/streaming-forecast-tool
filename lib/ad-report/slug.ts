import { randomBytes } from "node:crypto";

/** Unguessable URL token: 22 chars base64url (~132 bits). */
export function generateReportSlug(): string {
  return randomBytes(16).toString("base64url");
}
