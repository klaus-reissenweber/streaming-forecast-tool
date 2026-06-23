import Link from "next/link";

export default function ReleaseNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16 text-center">
      <h1 className="text-2xl font-semibold text-stone-900">Release not found</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        This release doesn&apos;t exist, or the link may be incorrect. Check the URL
        and try again.
      </p>
      <Link
        href="/new"
        className="mt-6 inline-flex rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800"
      >
        Create a new release
      </Link>
    </main>
  );
}
