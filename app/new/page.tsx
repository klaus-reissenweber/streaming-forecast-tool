import Link from "next/link";
import { ReleaseCreationForm } from "@/components/new/ReleaseCreationForm";

export default function NewReleasePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-release-title font-semibold text-foreground">
              Create release
            </h1>
          </div>

          <nav className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
            <Link
              href="/"
              className="text-accent-readable hover:text-accent-hover hover:underline"
            >
              Active releases
            </Link>
            <Link
              href="/archive"
              className="text-accent-readable hover:text-accent-hover hover:underline"
            >
              Archive
            </Link>
          </nav>
        </div>
      </header>

      <div className="mt-6">
        <ReleaseCreationForm />
      </div>
    </main>
  );
}
