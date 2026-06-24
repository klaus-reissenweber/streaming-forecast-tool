"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { requestMagicLink } from "@/app/login/actions";

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
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-16">
      <header className="mb-6 border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold text-stone-900">Sign in</h1>
        <p className="mt-1 text-sm text-stone-500">
          Red Light streaming forecast tool. Magic link only — no password.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            placeholder="you@redlightcreative.com"
          />
        </label>

        {error ? (
          <p className="rounded border border-red-600 bg-white p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded border border-emerald-600 bg-white p-3 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-stone-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send magic link"}
        </button>
      </form>
    </main>
  );
}
