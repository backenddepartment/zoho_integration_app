"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import type { Role } from "@/db/roles";
import type { CurrentUser } from "@/lib/auth";
import { askConfirm } from "./dialogs";
import { IconSignOut } from "./icons";

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const roleLabel = (role: Role) => role.charAt(0).toUpperCase() + role.slice(1);

const ROLE_TAG: Record<Role, string> = { superadmin: "tag-info", admin: "tag-info", staff: "tag-good", external: "tag-mute" };

/** The avatar in the top-right corner, like WorkDrive's; it opens the profile card with Your profile and Sign out. */
export function ProfileMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Close on a click elsewhere and on Escape (choosing an item closes it too).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        title={`${user.name} (${roleLabel(user.role)})`}
        className={`flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-[var(--tint)] sm:pl-3 ${open ? "bg-[var(--tint)]" : ""}`}
      >
        <span className="hidden max-w-40 truncate text-sm font-medium text-[var(--ink-2)] sm:block">{user.name}</span>
        <span className="avatar h-9 w-9 text-xs ring-2 ring-[var(--canvas)]">{getInitials(user.name)}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-72 animate-dialog-in overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--canvas)] shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
        >
          <div className="flex flex-col items-center gap-2 bg-[var(--tint)] px-5 pt-6 pb-5 text-center">
            <span className="avatar h-16 w-16 text-lg">{getInitials(user.name)}</span>
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-semibold text-[var(--ink)]">{user.name}</p>
              <p className="m-0 truncate text-xs text-[var(--ink-3)]">{user.email}</p>
            </div>
            <span className={`tag ${ROLE_TAG[user.role]}`}>{roleLabel(user.role)}</span>
          </div>
          <div className="flex flex-col p-2">
            <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--tint)]">
              Your profile
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                // Closing the menu removes this button, so sign out by calling the action itself
                // (not through a form in the menu, which would be gone by the time they confirm).
                setOpen(false);
                const ok = await askConfirm({ title: "Sign out?", message: "You'll need to sign in again to use Getmeds Files.", confirmLabel: "Sign out", danger: true });
                if (ok) startTransition(() => logoutAction());
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--bad)] hover:bg-[var(--bad-bg)]"
            >
              <IconSignOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
