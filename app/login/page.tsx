import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-16">
          <p className="text-sm text-stone-500">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
