import type { ReactNode } from "react";

export function SectionHeader({
  children,
  description,
}: {
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div>
      <h2 className="text-section font-semibold text-foreground">{children}</h2>
      {description ? (
        <p className="mt-1 text-sm text-secondary">{description}</p>
      ) : null}
    </div>
  );
}
