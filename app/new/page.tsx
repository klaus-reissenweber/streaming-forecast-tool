import { ReleaseCreationForm } from "@/components/new/ReleaseCreationForm";

export default function NewReleasePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="mb-6 border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold text-stone-900">New release</h1>
        <p className="mt-1 text-sm text-stone-500">
          Enter release details and planned ad spend. On submit, the forecast is
          locked and saved. You&apos;ll land on the release view.
        </p>
      </header>

      <ReleaseCreationForm />
    </main>
  );
}
