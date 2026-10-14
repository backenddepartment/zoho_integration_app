"use client";

import { useState, useSyncExternalStore } from "react";
import type { CurrentUser } from "@/lib/auth";
import { useActiveFolder } from "./active-folder";
import { AppSidebar } from "./app-sidebar";
import { DialogHost } from "./dialogs";
import { GetmedsLogo, IconMenu } from "./icons";
import { ProfileMenu } from "./profile-menu";

// Whether the desktop sidebar is collapsed to icons. Kept in this browser so it survives page changes
// and reloads; storage can be unavailable (private mode, blocked site data), so it then just stays open.
const SIDEBAR_KEY = "sidebar-collapsed";
const sidebarListeners = new Set<() => void>();

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  } catch {}
  sidebarListeners.forEach((notify) => notify());
}

function subscribeSidebar(notify: () => void) {
  sidebarListeners.add(notify);
  return () => {
    sidebarListeners.delete(notify);
  };
}

/** An entry in the sidebar's folder tree: a team folder, My Folders, or something shared with the user. */
export type NavPlace = { id: string; name: string; kind: "teamfolder" | "myfolder" | "folder" | "file" };

export function AppShellClient({ user, nav, children }: { user: CurrentUser; nav: NavPlace[]; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // The top folder the page is inside (reported by the page), kept highlighted in the tree.
  const activeId = useActiveFolder();
  // The server renders it open; the stored choice applies once the page hydrates.
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);

  return (
    <div className="flex min-h-screen w-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <DialogHost />
      {/* Desktop Sticky Sidebar */}
      <div
        className={`hidden md:block md:shrink-0 sticky top-0 h-screen transition-[width] duration-200 ease-in-out ${
          collapsed ? "md:w-16" : "md:w-64"
        }`}
      >
        <AppSidebar user={user} nav={nav} activeId={activeId} collapsed={collapsed} onToggleCollapsed={() => writeSidebarCollapsed(!collapsed)} />
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
        <AppSidebar user={user} nav={nav} activeId={activeId} onCloseMobile={() => setMobileOpen(false)} />
      </div>

      {/* Main Content Pane */}
      <div className="flex flex-1 min-w-0 flex-col">
        {/* Top bar: the menu button and name on phones; the profile in the top-right corner everywhere */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--rule)] bg-[var(--canvas)]/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 focus:outline-none"
              aria-label="Open sidebar menu"
            >
              <IconMenu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <GetmedsLogo className="w-6 h-6 shrink-0" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Getmeds Files
              </span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ProfileMenu user={user} />
          </div>
        </header>

        {/* Inner Page View */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
