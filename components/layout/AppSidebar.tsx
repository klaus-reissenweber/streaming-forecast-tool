"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Wordmark } from "@/components/layout/Wordmark";
import { activeNavItemId, adResultsHref, NAV_SECTIONS, type NavItemId } from "@/lib/nav";

function IconActive(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
      <path d="M5 7.5h6M5 10h4" />
    </svg>
  );
}

function IconNew(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

function IconArchive(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M2.5 5.5h11v7h-11zM2.5 3.5h11v2h-11zM6.5 8.5h3" />
    </svg>
  );
}

function IconAds(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M3.5 12.5V8M8 12.5V4.5M12.5 12.5V7" />
    </svg>
  );
}

function IconReports(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M4.5 2.5h5l3 3v8h-8z" />
      <path d="M9.5 2.5v3h3M6 8.5h4M6 11h3" />
    </svg>
  );
}

function IconRetrain(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M3.5 8a4.5 4.5 0 1 1 1.3 3.2" />
      <path d="M3.5 11.5v-3h3" />
    </svg>
  );
}

function IconApprove(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

function IconMenu(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </svg>
  );
}

function IconClose(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

const NAV_ICONS: Record<
  NavItemId,
  (props: { className?: string }) => ReactNode
> = {
  active: IconActive,
  new: IconNew,
  archive: IconArchive,
  "ad-results": IconAds,
  reports: IconReports,
  retrain: IconRetrain,
  approve: IconApprove,
};

function SidebarNav({
  pathname,
  activeId,
  onNavigate,
}: {
  pathname: string;
  activeId: NavItemId | null;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Internal">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id}>
          <p className="px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
            {section.label}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.id];
              const isActive = item.id === activeId;
              const href =
                item.id === "ad-results" ? adResultsHref(pathname) : item.href;
              return (
                <li key={item.id}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={
                      "relative flex items-center gap-2.5 rounded-instrument px-2 py-1.5 text-sm " +
                      (isActive
                        ? "bg-accent-tint font-medium text-foreground"
                        : "text-secondary hover:bg-canvas hover:text-foreground")
                    }
                  >
                    {isActive ? (
                      <span
                        className="absolute inset-y-1 left-0 w-[3px] rounded-r-tag bg-accent"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const activeId = activeNavItemId(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between border-b border-border bg-surface px-4 print:hidden md:hidden">
        <Link href="/" className="min-w-0" onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>
        <button
          type="button"
          className="rounded-instrument border border-border p-1.5 text-secondary hover:text-foreground"
          aria-expanded={open}
          aria-controls="internal-sidebar"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <IconClose className="size-4" />
          ) : (
            <IconMenu className="size-4" />
          )}
          <span className="sr-only">{open ? "Close navigation" : "Open navigation"}</span>
        </button>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-x-0 top-12 bottom-0 z-30 bg-foreground/20 print:hidden md:hidden"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        id="internal-sidebar"
        className={
          "fixed top-12 bottom-0 left-0 z-40 flex w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-canvas-subtle transition-transform duration-200 ease-out-quart print:hidden md:sticky md:inset-auto md:top-0 md:z-0 md:h-dvh md:self-start md:transition-none " +
          (open ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <div className="hidden shrink-0 border-b border-border px-4 py-4 md:block">
          <Link href="/" className="inline-flex min-w-0 items-center">
            <Wordmark />
          </Link>
        </div>
        <SidebarNav
          pathname={pathname}
          activeId={activeId}
          onNavigate={() => setOpen(false)}
        />
      </aside>
    </>
  );
}
