import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth/allowed-emails";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/archive";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not-allowed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
