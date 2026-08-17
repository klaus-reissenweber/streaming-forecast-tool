"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { requestMagicLink } from "@/app/login/actions";

export const LOGIN_INPUT_CLASS =
  "mt-1 w-full rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm text-foreground focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export const LOGIN_BUTTON_CLASS =
  "w-full rounded-instrument bg-foreground px-4 py-2.5 text-body-sm font-medium text-canvas hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-60";

function errorFromSearchParam(value: string | null): string | null {
  if (value === "not-allowed") {
    return "That email is not authorized. Use an account that has access, or ask for access.";
  }
  if (value) {
    return "That sign-in link did not work. Request a new one and try again.";
  }
  return null;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() =>
    errorFromSearchParam(searchParams.get("error")),
  );

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
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block" htmlFor="login-email">
        <span className="text-body-sm font-medium text-foreground">Email</span>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={LOGIN_INPUT_CLASS}
          disabled={pending}
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-instrument border border-semantic-negative/30 bg-semantic-negative-bg p-3 text-body-sm text-semantic-negative"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-instrument border border-semantic-positive/30 bg-semantic-positive-bg p-3 text-body-sm text-semantic-positive"
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={LOGIN_BUTTON_CLASS}
      >
        Sign in
      </button>
    </form>
  );
}

export function LoginFormFallback() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <label className="block">
        <span className="text-body-sm font-medium text-foreground">Email</span>
        <input
          type="email"
          disabled
          className={LOGIN_INPUT_CLASS}
        />
      </label>
      <button type="button" disabled className={LOGIN_BUTTON_CLASS}>
        Sign in
      </button>
    </div>
  );
}
