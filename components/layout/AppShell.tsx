"use client";

import { usePathname } from "next/navigation";
import { isPublicPath } from "@/lib/nav";
import { AppSidebar } from "@/components/layout/AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isPublicPath(pathname)) {
    return children;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <AppSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
