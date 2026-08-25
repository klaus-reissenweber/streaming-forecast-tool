/** Visible em dash; name announced to assistive tech. */
export function NotAvailable() {
  return (
    <span className="text-secondary">
      <span aria-hidden>—</span>
      <span className="sr-only">Not available</span>
    </span>
  );
}
