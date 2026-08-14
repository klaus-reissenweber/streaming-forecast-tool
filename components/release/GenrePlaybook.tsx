import { SectionHeader } from "@/components/layout/SectionHeader";
import type { ReactNode } from "react";
import { GENRE_PLAYBOOKS } from "@/lib/constants";
import type { Genre } from "@/lib/forecast";

export interface GenrePlaybookProps {
  genre: Genre;
}

type PlaybookSectionKey =
  | "optimize_for"
  | "best_practices"
  | "creative"
  | "avoid";

const PLAYBOOK_SECTIONS: readonly {
  key: PlaybookSectionKey;
  ruleClass: string;
  titleClass: string;
  title: string;
}[] = [
  {
    key: "optimize_for",
    ruleClass: "border-l-accent",
    titleClass: "text-accent-readable",
    title: "What to optimize for",
  },
  {
    key: "best_practices",
    ruleClass: "border-l-semantic-info",
    titleClass: "text-semantic-info",
    title: "Best practices",
  },
  {
    key: "creative",
    ruleClass: "border-l-muted",
    titleClass: "text-muted",
    title: "Creative direction",
  },
  {
    key: "avoid",
    ruleClass: "border-l-semantic-warning",
    titleClass: "text-semantic-warning",
    title: "Avoid",
  },
];

function formatGenreLabel(genre: Genre): string {
  return genre
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function PlaybookSectionItem({
  ruleClass,
  titleClass,
  title,
  children,
  isLast,
}: {
  ruleClass: string;
  titleClass: string;
  title: string;
  children: ReactNode;
  isLast: boolean;
}) {
  return (
    <li
      className={`border-l-[3px] py-3 pl-3.5 pr-3.5 ${ruleClass} ${
        isLast ? "" : "border-b border-border-subtle"
      }`}
    >
      <h3 className={`text-body-sm font-semibold ${titleClass}`}>{title}</h3>
      <div className="mt-1.5 text-body-sm leading-relaxed text-secondary">
        {children}
      </div>
    </li>
  );
}

export function GenrePlaybook({ genre }: GenrePlaybookProps) {
  const playbook = GENRE_PLAYBOOKS[genre];
  const genreLabel = formatGenreLabel(genre);

  return (
    <section className="motion-fade-up" aria-label="Genre playbook">
      <SectionHeader>{genreLabel} operational playbook</SectionHeader>

      <ul className="mt-4 overflow-hidden rounded-instrument border border-border bg-surface">
        {PLAYBOOK_SECTIONS.map((section, index) => {
          const isLast = index === PLAYBOOK_SECTIONS.length - 1;

          return (
            <PlaybookSectionItem
              key={section.key}
              ruleClass={section.ruleClass}
              titleClass={section.titleClass}
              title={section.title}
              isLast={isLast}
            >
              {section.key === "optimize_for" ? (
                <p>{playbook.optimize_for}</p>
              ) : null}
              {section.key === "best_practices" ? (
                <BulletList items={playbook.best_practices} />
              ) : null}
              {section.key === "creative" ? (
                <p>{playbook.creative}</p>
              ) : null}
              {section.key === "avoid" ? (
                <BulletList items={playbook.avoid} />
              ) : null}
            </PlaybookSectionItem>
          );
        })}
      </ul>
    </section>
  );
}
