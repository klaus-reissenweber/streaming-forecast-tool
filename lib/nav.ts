/**
 * Internal sidebar destinations. Public routes (/report/[slug], /login) stay out.
 */

export type NavItemId =
  | "active"
  | "new"
  | "archive"
  | "ad-results"
  | "reports"
  | "retrain"
  | "approve";

export type NavItem = {
  id: NavItemId;
  label: string;
  href: string;
};

export type NavSection = {
  id: "releases" | "ads" | "model";
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "releases",
    label: "Releases",
    items: [
      { id: "active", label: "Active releases", href: "/" },
      { id: "new", label: "New release", href: "/new" },
      { id: "archive", label: "Archive", href: "/archive" },
    ],
  },
  {
    id: "ads",
    label: "Ads",
    items: [
      { id: "ad-results", label: "Ad results", href: "/ads" },
      { id: "reports", label: "Reports", href: "/reports" },
    ],
  },
  {
    id: "model",
    label: "Model",
    items: [
      { id: "retrain", label: "Retrain", href: "/admin/retrain" },
      { id: "approve", label: "Approve drafts", href: "/admin/retrain/approve" },
    ],
  },
];

/** Routes that must not render the internal sidebar. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return true;
  }
  if (pathname.startsWith("/report/")) {
    return true;
  }
  if (pathname.startsWith("/auth/")) {
    return true;
  }
  return false;
}

export function adResultsHref(pathname: string): string {
  const match = pathname.match(/^\/release\/([^/]+)/);
  if (match) {
    return `/release/${match[1]}/ad-upload`;
  }
  return "/ads";
}

export function activeNavItemId(pathname: string): NavItemId | null {
  if (pathname === "/new" || pathname.startsWith("/new/")) {
    return "new";
  }
  if (pathname === "/archive" || pathname.startsWith("/archive/")) {
    return "archive";
  }
  if (
    pathname === "/ads" ||
    pathname.startsWith("/ads/") ||
    /\/release\/[^/]+\/ad-upload(?:\/|$)/.test(pathname)
  ) {
    return "ad-results";
  }
  if (pathname === "/reports" || pathname.startsWith("/reports/")) {
    return "reports";
  }
  if (
    pathname === "/admin/retrain/approve" ||
    pathname.startsWith("/admin/retrain/approve/")
  ) {
    return "approve";
  }
  if (pathname === "/admin/retrain" || pathname.startsWith("/admin/retrain/")) {
    return "retrain";
  }
  if (pathname === "/") {
    return "active";
  }
  if (pathname.startsWith("/release/")) {
    return "active";
  }
  return null;
}
