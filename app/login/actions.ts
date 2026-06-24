"use server";

import {
  allowedEmailsConfigured,
  isAllowedEmail,
} from "@/lib/auth/allowed-emails";
import { createClient } from "@/lib/supabase/server";

export type LoginActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  return "http://localhost:3000";
}

export async function requestMagicLink(
  email: string,
): Promise<LoginActionResult> {
  if (!allowedEmailsConfigured()) {
    return {
      success: false,
      error: "Login is not configured. Set AUTH_ALLOWED_EMAILS.",
    };
  }

  const normalized = email.trim().toLowerCase();
  if (!isAllowedEmail(normalized)) {
    return {
      success: false,
      error: "That email is not authorized for this tool.",
    };
  }

  const supabase = await createClient();
  const origin = siteOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return {
      success: false,
      error: "Could not send sign-in link. Try again in a moment.",
    };
  }

  return {
    success: true,
    message: "Check your email for a sign-in link.",
  };
}
