import { isAllowedEmail } from "@/lib/auth/allowed-emails";
import { readDevBypassUser } from "@/lib/auth/dev-bypass";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type RequireAllowedUserResult =
  | { ok: true; user: User; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string };

/**
 * Server-action auth gate: session must exist and email must be allowlisted.
 * Do not rely on middleware alone — actions are directly callable.
 */
export async function requireAllowedUser(): Promise<RequireAllowedUserResult> {
  const bypass = readDevBypassUser();
  if (bypass) {
    const supabase = await createClient();
    return {
      ok: true,
      user: {
        id: bypass.id,
        email: bypass.email,
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      } as User,
      supabase,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, error: "You must be signed in to do that." };
  }

  if (!isAllowedEmail(user.email)) {
    return { ok: false, error: "Your account is not authorized for this tool." };
  }

  return { ok: true, user, supabase };
}
