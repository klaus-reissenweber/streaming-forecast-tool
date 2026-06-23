"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  isCorruptReleaseDataError,
  releaseErrorUserMessage,
} from "@/lib/release-errors";

interface ReleaseErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ReleaseError({ error, reset }: ReleaseErrorProps) {
  const corrupt = isCorruptReleaseDataError(error);
  const message = releaseErrorUserMessage(error);

  useEffect(() => {
    console.error("Release page error:", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <div
        className={
          "rounded-lg border p-6 " +
          (corrupt
            ? "border-amber-300 bg-amber-50"
            : "border-red-200 bg-red-50")
        }
      >
        <h1 className="text-xl font-semibold text-stone-900">
          {corrupt ? "Release data problem" : "Couldn\u2019t load release"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-700">{message}</p>

        {!corrupt ? (
          <button
            type="button"
            onClick={() => reset()}
            className="mt-5 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Try again
          </button>
        ) : null}
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/new"
          className="text-sm font-medium text-orange-700 hover:text-orange-800 hover:underline"
        >
          Create another release
        </Link>
      </div>
    </main>
  );
}
