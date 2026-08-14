import { StatusPill } from "@/components/ui/StatusPill";
import type { GuardrailCheck } from "@/lib/model/draft-review";

function GuardrailList({
  title,
  tag,
  checks,
}: {
  title: string;
  tag: string;
  checks: GuardrailCheck[];
}) {
  return (
    <div className="rounded-instrument border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {title}
        </h3>
        <span className="text-caption text-muted">{tag}</span>
      </div>
      <ul className="mt-3 space-y-3">
        {checks.map((check) => (
          <li key={check.id} className="text-body-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <StatusPill tone={check.passed ? "positive" : "warning"}>
                {check.passed ? "Pass" : "Fail"}
              </StatusPill>
              <span className="font-medium text-foreground">{check.label}</span>
            </div>
            <p className="mt-1 font-mono text-xs text-secondary">{check.value}</p>
            {check.detail ? (
              <p className="mt-0.5 text-caption text-semantic-warning">
                {check.detail}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GuardrailPanel({
  hard,
  soft,
}: {
  hard: GuardrailCheck[];
  soft: GuardrailCheck[];
}) {
  return (
    <section className="motion-fade-up">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-section font-semibold text-foreground">
          Guardrails
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <GuardrailList title="Hard" tag="Blocks use" checks={hard} />
        <GuardrailList title="Soft" tag="Warn only" checks={soft} />
      </div>
    </section>
  );
}
