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
  tag: string;
  tagClass: string;
  ruleClass: string;
  titleClass: string;
  title: string;
}[] = [
  {
    key: "optimize_for",
    tag: "[GOAL]",
    tagClass: "bracket-tag--accent",
    ruleClass: "border-l-accent",
    titleClass: "text-accent-readable",
    title: "What to optimize for",
  },
  {
    key: "best_practices",
    tag: "[PLAYS]",
    tagClass: "bracket-tag--info",
    ruleClass: "border-l-semantic-info",
    titleClass: "text-semantic-info",
    title: "Best practices",
  },
  {
    key: "creative",
    tag: "[CREATIVE]",
    tagClass: "bracket-tag--neutral",
    ruleClass: "border-l-muted",
    titleClass: "text-muted",
    title: "Creative direction",
  },
  {
    key: "avoid",
    tag: "[AVOID]",
    tagClass: "bracket-tag--warning",
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
  tag,
  tagClass,
  ruleClass,
  titleClass,
  title,
  children,
  isLast,
}: {
  tag: string;
  tagClass: string;
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
      <h3 className="text-body-sm font-semibold">
        <span className={`bracket-tag mr-1.5 align-middle ${tagClass}`}>
          {tag}
        </span>
        <span className={`align-middle ${titleClass}`}>{title}</span>
      </h3>
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
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent mr-2 align-middle">
          [PLAYBOOK]
        </span>
        <span className="instrument-section-title align-middle">
          {genreLabel} operational playbook
        </span>
      </h2>

      <ul className="mt-4 overflow-hidden rounded-instrument border border-border bg-surface">
        {PLAYBOOK_SECTIONS.map((section, index) => {
          const isLast = index === PLAYBOOK_SECTIONS.length - 1;

          return (
            <PlaybookSectionItem
              key={section.key}
              tag={section.tag}
              tagClass={section.tagClass}
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
