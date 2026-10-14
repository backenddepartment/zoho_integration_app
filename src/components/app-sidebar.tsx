"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { isAdminRole, type Role } from "@/db/roles";
import type { CurrentUser } from "@/lib/auth";
import {
  IconClose,
  IconFiles,
  IconKey,
  IconSignOut,
  IconTrash,
  IconUsers,
  IconWorkDrive,
  IconWorkDriveLogo,
} from "./icons";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function roleBadgeClass(role: Role) {
  switch (role) {
    case "superadmin":
      return "bg-purple-900/50 text-purple-300 border-purple-700/50";
    case "admin":
      return "bg-sky-900/50 text-sky-300 border-sky-700/50";
    case "staff":
      return "bg-emerald-900/50 text-emerald-300 border-emerald-700/50";
    default:
      return "bg-slate-800 text-slate-300 border-slate-700";
  }
}

export function AppSidebar({
  user,
  onCloseMobile,
}: {
  user: CurrentUser;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();

  const isFilesActive = pathname === "/files" || pathname.startsWith("/files/");
  const isUsersActive = pathname === "/admin/users" || pathname.startsWith("/admin/users/");
  const isDeletedActive = pathname === "/admin/deleted" || pathname.startsWith("/admin/deleted/");
  const isWorkDriveActive = pathname === "/admin";
  const isPasswordActive = pathname === "/account/password";

  const isAdmin = isAdminRole(user.role);

  return (
    <aside
      className="flex h-full w-64 flex-col bg-[#182232] text-slate-200 border-r border-[#243347] select-none"
      aria-label="WorkDrive Sidebar Navigation"
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#243347]/80 bg-[#141d2c]/50">
        <Link
          href="/files"
          onClick={onCloseMobile}
          className="flex items-center gap-2.5 group transition-transform active:scale-95"
        >
          <IconWorkDriveLogo className="w-8 h-8 shrink-0 drop-shadow-sm" />
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-[15px] text-white tracking-tight group-hover:text-[#38BDF8] transition-colors">
              Getmeds Files
            </span>
            <span className="text-xs text-slate-400 font-medium">
              Zoho WorkDrive
            </span>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden rounded p-1 text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Close menu"
          >
            <IconClose className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
        {/* WorkDrive section */}
        <div>
          <div className="px-3 pb-1.5 text-xs font-medium text-slate-400">
            WorkDrive
          </div>
          <div className="space-y-0.5">
            <Link
              href="/files"
              onClick={onCloseMobile}
              className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                isFilesActive
                  ? "bg-[#1EA0DA]/20 text-white"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.07]"
              }`}
            >
              <IconFiles
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isFilesActive ? "text-[#1EA0DA]" : "text-slate-400 group-hover:text-slate-200"
                }`}
              />
              <span>Files</span>
            </Link>
          </div>
        </div>

        {/* Administration section */}
        {isAdmin && (
          <div>
            <div className="px-3 pb-1.5 text-xs font-medium text-slate-400">
              Administration
            </div>
            <div className="space-y-0.5">
              <Link
                href="/admin/users"
                onClick={onCloseMobile}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  isUsersActive
                    ? "bg-[#1EA0DA]/20 text-white"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.07]"
                }`}
              >
                <IconUsers
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isUsersActive ? "text-[#1EA0DA]" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>Users</span>
              </Link>

              <Link
                href="/admin/deleted"
                onClick={onCloseMobile}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  isDeletedActive
                    ? "bg-[#1EA0DA]/20 text-white"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.07]"
                }`}
              >
                <IconTrash
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isDeletedActive ? "text-[#1EA0DA]" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>Deleted items</span>
              </Link>

              <Link
                href="/admin"
                onClick={onCloseMobile}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  isWorkDriveActive
                    ? "bg-[#1EA0DA]/20 text-white"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.07]"
                }`}
              >
                <IconWorkDrive
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isWorkDriveActive ? "text-[#1EA0DA]" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>WorkDrive</span>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* User Profile & Account Footer */}
      <div className="mt-auto border-t border-[#243347] bg-[#141d2c]/85 p-3.5 pb-6 space-y-2.5">
        {/* User identification */}
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1EA0DA] to-[#12769F] text-xs font-semibold text-white shadow-sm ring-1 ring-white/20">
            {getInitials(user.name)}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-white truncate" title={user.name}>
              {user.name}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`inline-block text-[10px] font-medium px-1.5 py-0.2 rounded border uppercase tracking-wider ${roleBadgeClass(
                  user.role
                )}`}
              >
                {user.role}
              </span>
            </div>
          </div>
        </div>

        {/* User actions */}
        <div className="flex flex-col gap-1 pt-1 border-t border-[#243347]/70">
          <Link
            href="/account/password"
            onClick={onCloseMobile}
            className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isPasswordActive
                ? "bg-[#1EA0DA]/20 text-white"
                : "text-slate-300 hover:text-white hover:bg-white/[0.07]"
            }`}
          >
            <IconKey
              className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                isPasswordActive ? "text-[#1EA0DA]" : "text-slate-400 group-hover:text-slate-200"
              }`}
            />
            <span>Password</span>
          </Link>

          <form action={logoutAction} className="w-full">
            <button
              type="submit"
              className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left"
            >
              <IconSignOut className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-red-400 transition-colors" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
