import type { ReactNode } from "react";
import { GENRE_PLAYBOOKS } from "@/lib/constants";
import type { Genre } from "@/lib/forecast";

export interface GenrePlaybookProps {
  genre: Genre;
}

function PlaybookSection({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  tone?: "neutral" | "emerald" | "red";
}) {
  const titleClass =
    tone === "emerald"
      ? "text-emerald-800"
      : tone === "red"
        ? "text-red-800"
        : "text-stone-700";

  return (
    <section className="border-t border-stone-100 pt-5 first:border-t-0 first:pt-0">
      <h3 className={`text-sm font-semibold ${titleClass}`}>{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-stone-700">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function GenrePlaybook({ genre }: GenrePlaybookProps) {
  const playbook = GENRE_PLAYBOOKS[genre];

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-stone-900">Genre playbook</h2>
      <p className="mt-1 text-sm text-stone-500">{genre}</p>

      <div className="mt-5 space-y-0">
        <PlaybookSection title="What to optimize for">
          <p>{playbook.optimize_for}</p>
        </PlaybookSection>

        <PlaybookSection title="Best practices" tone="emerald">
          <BulletList items={playbook.best_practices} />
        </PlaybookSection>

        <PlaybookSection title="Creative direction">
          <p>{playbook.creative}</p>
        </PlaybookSection>

        <PlaybookSection title="Avoid" tone="red">
          <BulletList items={playbook.avoid} />
        </PlaybookSection>
      </div>
    </section>
  );
}
