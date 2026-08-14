import { ReleaseCreationForm } from "@/components/new/ReleaseCreationForm";
import { loadActiveModel } from "@/lib/load-active-model";

export default async function NewReleasePage() {
  const model = await loadActiveModel();

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <h1 className="font-serif text-release-title font-semibold text-foreground">
          Create release
        </h1>
      </header>

      <div className="mt-6">
        <ReleaseCreationForm adModel={model.adModel} />
      </div>
    </main>
  );
}
