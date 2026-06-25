"use client";

export interface ToggleOption<T extends string | number> {
  value: T;
  label: string;
}

interface ToggleGroupProps<T extends string | number> {
  name: string;
  label: string;
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  error?: string;
  /** When true, options stack vertically (useful for long labels). */
  vertical?: boolean;
}

export function ToggleGroup<T extends string | number>({
  name,
  label,
  options,
  value,
  onChange,
  disabled = false,
  error,
  vertical = false,
}: ToggleGroupProps<T>) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="text-body-sm font-medium text-foreground">{label}</legend>

      <div
        className={
          vertical
            ? "flex flex-col gap-2"
            : "flex flex-wrap gap-2"
        }
        role="radiogroup"
        aria-label={label}
        aria-invalid={error ? true : undefined}
      >
        {options.map((option) => {
          const selected = value === option.value;
          const id = `${name}-${String(option.value)}`;

          return (
            <label
              key={id}
              htmlFor={id}
              className={
                "cursor-pointer rounded-instrument border px-3 py-2 text-body-sm transition " +
                (selected
                  ? "border-accent-border bg-accent-tint font-medium text-accent-readable"
                  : "border-border bg-surface text-secondary hover:border-border hover:bg-canvas") +
                (disabled ? " cursor-not-allowed opacity-50" : "")
              }
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={String(option.value)}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>

      {error ? (
        <p className="text-caption text-semantic-negative" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
