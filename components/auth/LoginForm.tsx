"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { requestMagicLink } from "@/app/login/actions";

const INPUT_CLASS =
  "mt-1 w-full rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const authError = searchParams.get("error");
    if (authError === "not-allowed") {
      return "That account is not authorized.";
    }
    if (authError) {
      return "Sign-in failed. Request a new link.";
    }
    return null;
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);

    const result = await requestMagicLink(email);
    if (result.success) {
      setMessage(result.message);
    } else {
      setError(result.error);
    }
    setPending(false);
  }

  return (
    <main className="flex min-h-full flex-col justify-center bg-canvas px-5 py-16">
      <div className="mx-auto w-full max-w-md rounded-instrument border border-border bg-surface p-6">
        <header className="mb-6">
          <h1 className="font-serif text-section font-semibold text-foreground">
            Sign in
          </h1>
          <p className="mt-1 text-body-sm text-secondary">
            Red Light streaming forecast tool. Magic link only — no password.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-body-sm font-medium text-foreground">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT_CLASS}
              placeholder="you@redlightcreative.com"
              disabled={pending}
            />
          </label>

          {error ? (
            <p className="rounded-instrument border border-semantic-negative/30 bg-semantic-negative-bg p-3 text-body-sm text-semantic-negative">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-instrument border border-semantic-positive/30 bg-semantic-positive-bg p-3 text-body-sm text-semantic-positive">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-instrument bg-foreground px-4 py-2.5 text-body-sm font-medium text-canvas hover:bg-foreground/90 disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send magic link"}
          </button>
        </form>
      </div>
    </main>
  );
}
