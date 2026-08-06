"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { createRelease } from "@/app/new/actions";
import { AdSpendLiveForecast } from "@/components/new/AdSpendLiveForecast";
import { MonthlyListenersField } from "@/components/new/MonthlyListenersField";
import { ToggleGroup } from "@/components/new/ToggleGroup";
import {
  EDITORIAL_TIER_DEFINITIONS,
  EDITORIAL_TIER_TOGGLE_OPTIONS,
  GENRES,
  RELEASE_TYPE_LABELS,
  RELEASE_TYPES,
} from "@/lib/constants";
import type { EditorialTier, Genre } from "@/lib/forecast";
import { DEFAULT_NEW_RELEASE_FORM_VALUES } from "@/lib/map-new-release";
import type { AdModel } from "@/lib/model/ad-model";
import {
  parseAndValidateNewReleaseForm,
  type NewReleaseFieldKey,
  type NewReleaseFormRawValues,
} from "@/lib/validate-new-release";

const FEATURE_OPTIONS = [
  { value: "solo", label: "Solo release" },
  { value: "feature", label: "Feature / collab" },
] as const;

const TEXT_INPUT_CLASS =
  "rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const NUMERIC_INPUT_CLASS = `${TEXT_INPUT_CLASS} font-mono tabular-nums`;

function FormSection({
  label,
  children,
  tone = "primary",
}: {
  label: string;
  children: ReactNode;
  /** Paid advertising is visually subordinate to the organic lock forecast. */
  tone?: "primary" | "secondary";
}) {
  if (tone === "secondary") {
    return (
      <section className="mt-6 rounded-instrument border border-border bg-canvas-subtle p-4 sm:p-5">
        <h2 className="mb-1 text-body-sm font-medium text-secondary">{label}</h2>
        <p className="mb-4 text-caption text-muted">
          Optional paid lift — separate from the organic streaming forecast
        </p>
        {children}
      </section>
    );
  }

  return (
    <section className="border-t border-border pt-6 first:border-t-0 first:pt-0">
      <h2 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </h2>
      {children}
    </section>
  );
}

function MessageBox({
  tone,
  title,
  items,
}: {
  tone: "error" | "warn";
  title: string;
  items: string[];
}) {
  if (items.length === 0) {
    return null;
  }

  if (tone === "error") {
    return (
      <div className="rounded-instrument border border-semantic-negative/30 bg-semantic-negative-bg p-3">
        <div className="text-body-sm font-semibold text-semantic-negative">
          {title}
        </div>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-body-sm text-secondary">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-instrument border border-semantic-warning/30 bg-semantic-warning-bg p-3">
      <div className="text-body-sm font-semibold text-semantic-warning">
        {title}
      </div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-body-sm text-secondary">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ReleaseCreationForm({ adModel }: { adModel: AdModel }) {
  const [values, setValues] = useState<NewReleaseFormRawValues>(
    DEFAULT_NEW_RELEASE_FORM_VALUES,
  );
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<
    Partial<Record<NewReleaseFieldKey, string>>
  >({});

  const validation = useMemo(
    () => parseAndValidateNewReleaseForm(values),
    [values],
  );

  const fieldErrors = { ...validation.fieldErrors, ...serverFieldErrors };
  const errorItems = [
    ...Object.values(fieldErrors).filter(Boolean),
    ...validation.formErrors,
    ...(submitError ? [submitError] : []),
  ] as string[];

  const canSubmit = validation.valid && !pending;

  function setField<K extends keyof NewReleaseFormRawValues>(
    key: K,
    value: NewReleaseFormRawValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
    setServerFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setPending(true);
    setSubmitError(null);
    setServerFieldErrors({});

    const result = await createRelease(values);

    if (!result.success) {
      if (result.fieldErrors) {
        setServerFieldErrors(result.fieldErrors);
      }
      if (result.error) {
        setSubmitError(result.error);
      }
      setPending(false);
    }
  }

  const editorialTier = values.editorialTier as EditorialTier;
  const genre = (values.genre || "house") as Genre;
  const coerced = validation.values;

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-instrument border border-border bg-surface p-5 sm:p-6"
    >
      <FormSection label="Track data">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-body-sm font-medium text-foreground">
              Track name
            </span>
            <input
              className={TEXT_INPUT_CLASS}
              value={values.trackName}
              onChange={(event) => setField("trackName", event.target.value)}
              disabled={pending}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-body-sm font-medium text-foreground">
              Artist
            </span>
            <input
              className={TEXT_INPUT_CLASS}
              value={values.artistName}
              onChange={(event) => setField("artistName", event.target.value)}
              disabled={pending}
            />
          </label>
        </div>

        <div className="mt-4">
          <ToggleGroup
            name="genre"
            label="Genre"
            options={GENRES.map((g) => ({ value: g, label: g }))}
            value={values.genre}
            onChange={(next) => setField("genre", next as Genre)}
            disabled={pending}
          />
        </div>

        <div className="mt-4">
          <MonthlyListenersField
            value={values.monthlyListeners}
            onChange={(monthlyListeners) =>
              setField("monthlyListeners", monthlyListeners)
            }
            disabled={pending}
          />
        </div>

        <div className="mt-4">
          <ToggleGroup
            name="isFeature"
            label="Solo vs feature"
            options={[...FEATURE_OPTIONS]}
            value={values.isFeature ? "feature" : "solo"}
            onChange={(choice) => setField("isFeature", choice === "feature")}
            disabled={pending}
          />
        </div>

        <div className="mt-4 w-[560px] max-w-full shrink-0">
          <ToggleGroup
            name="editorialTier"
            label="Editorial tier"
            options={EDITORIAL_TIER_TOGGLE_OPTIONS}
            value={editorialTier}
            onChange={(tier) => setField("editorialTier", tier)}
            disabled={pending}
          />
          <p className="mt-2 text-caption leading-relaxed text-muted">
            {EDITORIAL_TIER_DEFINITIONS[editorialTier].description}
          </p>
        </div>

        <label className="mt-4 flex flex-col gap-1 sm:max-w-xs">
          <span className="text-body-sm font-medium text-foreground">
            Release date
          </span>
          <input
            type="date"
            className={TEXT_INPUT_CLASS}
            value={values.releaseDate}
            onChange={(event) => setField("releaseDate", event.target.value)}
            disabled={pending}
          />
        </label>
      </FormSection>

      <FormSection label="Paid advertising" tone="secondary">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-foreground">
                Spotify Marquee (USD)
              </span>
              <input
                className={NUMERIC_INPUT_CLASS}
                inputMode="decimal"
                value={values.spotifyMarqueeSpendPlanned}
                onChange={(event) =>
                  setField("spotifyMarqueeSpendPlanned", event.target.value)
                }
                disabled={pending}
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-foreground">
                Spotify Showcase (USD)
              </span>
              <input
                className={NUMERIC_INPUT_CLASS}
                inputMode="decimal"
                value={values.spotifyShowcaseSpendPlanned}
                onChange={(event) =>
                  setField("spotifyShowcaseSpendPlanned", event.target.value)
                }
                disabled={pending}
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-foreground">
                Meta traffic (USD)
              </span>
              <input
                className={NUMERIC_INPUT_CLASS}
                inputMode="decimal"
                value={values.metaTrafficSpendPlanned}
                onChange={(event) =>
                  setField("metaTrafficSpendPlanned", event.target.value)
                }
                disabled={pending}
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-foreground">
                Meta awareness (USD)
              </span>
              <input
                className={NUMERIC_INPUT_CLASS}
                inputMode="decimal"
                value={values.metaAwarenessSpendPlanned}
                onChange={(event) =>
                  setField("metaAwarenessSpendPlanned", event.target.value)
                }
                disabled={pending}
                placeholder="0"
              />
            </label>
          </div>

          {values.genre ? (
            <AdSpendLiveForecast
              artistName={values.artistName}
              genre={genre}
              marqueeSpend={coerced.spotifyMarqueeSpendPlanned}
              showcaseSpend={coerced.spotifyShowcaseSpendPlanned}
              metaTrafficSpend={coerced.metaTrafficSpendPlanned}
              metaAwarenessSpend={coerced.metaAwarenessSpendPlanned}
              adModel={adModel}
            />
          ) : null}
        </div>
      </FormSection>

      <FormSection label="Streaming forecast">
        <div className="space-y-4">
          <ToggleGroup
            name="releaseType"
            label="Release type"
            options={RELEASE_TYPES.map((type) => ({
              value: type,
              label: RELEASE_TYPE_LABELS[type],
            }))}
            value={values.releaseType}
            onChange={(releaseType) => setField("releaseType", releaseType)}
            disabled={pending}
          />

          {errorItems.length > 0 ? (
            <MessageBox
              tone="error"
              title={`${errorItems.length} thing(s) to fix`}
              items={errorItems}
            />
          ) : null}

          {validation.warnings.length > 0 ? (
            <MessageBox tone="warn" title="Heads up" items={validation.warnings} />
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className={
              "w-full rounded-instrument px-4 py-3 text-body-sm font-semibold transition " +
              (canSubmit
                ? "bg-foreground text-canvas hover:bg-foreground/90"
                : "cursor-not-allowed bg-bracket-bg text-muted")
            }
          >
            {pending
              ? "Locking forecast…"
              : canSubmit
                ? "Create release & lock forecast"
                : "Fix the items above to continue"}
          </button>
        </div>
      </FormSection>
    </form>
  );
}
