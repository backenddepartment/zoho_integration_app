"use client";

import { useState } from "react";
import type { CurrentUser } from "@/lib/auth";
import { AppSidebar } from "./app-sidebar";
import { IconMenu, IconWorkDriveLogo } from "./icons";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Desktop Sticky Sidebar */}
      <div className="hidden md:block md:w-64 md:shrink-0 sticky top-0 h-screen">
        <AppSidebar user={user} />
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:hidden shadow-2xl ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <AppSidebar user={user} onCloseMobile={() => setMobileOpen(false)} />
      </div>

      {/* Main Content Pane */}
      <div className="flex flex-1 min-w-0 flex-col">
        {/* Mobile Top Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 focus:outline-none"
              aria-label="Open sidebar menu"
            >
              <IconMenu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <IconWorkDriveLogo className="w-6 h-6 shrink-0" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Getmeds Files
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-[#1EA0DA] to-[#12769F] text-[11px] font-semibold text-white shadow-sm"
              title={`${user.name} (${user.role})`}
            >
              {getInitials(user.name)}
            </div>
          </div>
        </header>

        {/* Inner Page View */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

// Backwards compatibility export
export { AppShell as AppHeader };
