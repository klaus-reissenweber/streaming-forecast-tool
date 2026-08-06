"use client";

export function SaveAsPdfButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-canvas print:hidden"
    >
      Save as PDF
    </button>
  );
}
