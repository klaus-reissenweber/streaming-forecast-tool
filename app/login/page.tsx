import { Suspense } from "react";
import { LoginForm, LoginFormFallback } from "@/components/auth/LoginForm";
import { LoginPitch } from "@/components/auth/LoginPitch";
import { Wordmark } from "@/components/layout/Wordmark";

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-12 px-5 py-10 md:flex-row md:items-center md:gap-16 lg:gap-24">
        <div className="w-full md:max-w-sm md:shrink-0">
          <Wordmark />
          <h1 className="mt-4 text-body-sm text-secondary">
            Week-one streaming forecasts for electronic releases.
          </h1>
          <div className="mt-8">
            <Suspense fallback={<LoginFormFallback />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <LoginPitch />
      </div>
    </main>
  );
}
