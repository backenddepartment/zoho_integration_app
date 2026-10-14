"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { logoutAction } from "@/app/actions/auth";
import { isAdminRole, type Role } from "@/db/roles";
import type { CurrentUser } from "@/lib/auth";
import {
  IconClose,
  IconFiles,
  IconKey,
  IconSidebar,
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

function roleTextClass(role: Role) {
  switch (role) {
    case "superadmin":
      return "text-purple-300";
    case "admin":
      return "text-sky-300";
    case "staff":
      return "text-emerald-300";
    default:
      return "text-slate-300";
  }
}

function roleLabel(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`group flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-all ${
        collapsed ? "justify-center px-2" : "px-3"
      } ${active ? "bg-[#1EA0DA]/20 text-white" : "text-slate-300 hover:text-white hover:bg-white/[0.07]"}`}
    >
      <Icon
        className={`w-4 h-4 shrink-0 transition-colors ${
          active ? "text-[#1EA0DA]" : "text-slate-400 group-hover:text-slate-200"
        }`}
      />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

// A section heading, or a hairline in its place when the sidebar shows icons only.
function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="mx-2 mb-2 border-t border-[#243347]" aria-hidden="true" />;
  return <div className="px-3 pb-1.5 text-xs font-medium text-slate-400">{label}</div>;
}

export function AppSidebar({
  user,
  onCloseMobile,
  collapsed = false,
  onToggleCollapsed,
}: {
  user: CurrentUser;
  onCloseMobile?: () => void;
  /** Icons only, no labels (desktop). */
  collapsed?: boolean;
  /** Shows the collapse/expand button when given. */
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();

  const isFilesActive = pathname === "/files" || pathname.startsWith("/files/");
  const isUsersActive = pathname === "/admin/users" || pathname.startsWith("/admin/users/");
  const isDeletedActive = pathname === "/admin/deleted" || pathname.startsWith("/admin/deleted/");
  const isWorkDriveActive = pathname === "/admin";
  const isPasswordActive = pathname === "/account/password";

  const isAdmin = isAdminRole(user.role);

  const toggleButton = onToggleCollapsed && (
    <button
      type="button"
      onClick={onToggleCollapsed}
      className="shrink-0 rounded-md p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <IconSidebar className="w-[18px] h-[18px]" />
    </button>
  );

  return (
    <aside
      className={`flex h-full flex-col bg-[#182232] text-slate-200 border-r border-[#243347] select-none transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-16" : "w-64"
      }`}
      aria-label="WorkDrive Sidebar Navigation"
    >
      {/* Brand Header */}
      <div
        className={`flex border-b border-[#243347]/80 bg-[#141d2c]/50 ${
          collapsed ? "flex-col items-center gap-2 px-2 py-4" : "items-center justify-between gap-2 px-4 py-4"
        }`}
      >
        <Link
          href="/files"
          onClick={onCloseMobile}
          title={collapsed ? "Getmeds Files" : undefined}
          className="flex min-w-0 items-center gap-2.5 group transition-transform active:scale-95"
        >
          <IconWorkDriveLogo className="w-8 h-8 shrink-0 drop-shadow-sm" />
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-bold text-[15px] text-white tracking-tight group-hover:text-[#38BDF8] transition-colors">
                Getmeds Files
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Zoho WorkDrive
              </span>
            </div>
          )}
        </Link>
        {toggleButton}
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
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-5 ${collapsed ? "px-2" : "px-2.5"}`}>
        {/* WorkDrive section */}
        <div>
          <SectionLabel label="WorkDrive" collapsed={collapsed} />
          <div className="space-y-0.5">
            <NavItem href="/files" label="Files" icon={IconFiles} active={isFilesActive} collapsed={collapsed} onNavigate={onCloseMobile} />
          </div>
        </div>

        {/* Administration section */}
        {isAdmin && (
          <div>
            <SectionLabel label="Administration" collapsed={collapsed} />
            <div className="space-y-0.5">
              <NavItem href="/admin/users" label="Users" icon={IconUsers} active={isUsersActive} collapsed={collapsed} onNavigate={onCloseMobile} />
              <NavItem
                href="/admin/deleted"
                label="Deleted items"
                icon={IconTrash}
                active={isDeletedActive}
                collapsed={collapsed}
                onNavigate={onCloseMobile}
              />
              <NavItem href="/admin" label="WorkDrive" icon={IconWorkDrive} active={isWorkDriveActive} collapsed={collapsed} onNavigate={onCloseMobile} />
            </div>
          </div>
        )}
      </nav>

      {/* User Profile & Account Footer */}
      <div className={`mt-auto border-t border-[#243347] bg-[#141d2c]/85 pb-6 space-y-2.5 ${collapsed ? "px-2 pt-3.5" : "p-3.5"}`}>
        {/* User identification */}
        <div className={`flex items-center gap-2.5 py-1 ${collapsed ? "justify-center" : "px-1"}`}>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1EA0DA] to-[#12769F] text-xs font-semibold text-white shadow-sm ring-1 ring-white/20"
            title={collapsed ? `${user.name} (${roleLabel(user.role)})` : undefined}
          >
            {getInitials(user.name)}
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-white truncate" title={user.name}>
                {user.name}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[11px] font-medium ${roleTextClass(user.role)}`}>{roleLabel(user.role)}</span>
              </div>
            </div>
          )}
        </div>

        {/* User actions */}
        <div className="flex flex-col gap-1 pt-1 border-t border-[#243347]/70">
          <Link
            href="/account/password"
            onClick={onCloseMobile}
            title={collapsed ? "Password" : undefined}
            aria-label={collapsed ? "Password" : undefined}
            className={`group flex items-center gap-2.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
              collapsed ? "justify-center px-2" : "px-2.5"
            } ${isPasswordActive ? "bg-[#1EA0DA]/20 text-white" : "text-slate-300 hover:text-white hover:bg-white/[0.07]"}`}
          >
            <IconKey
              className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                isPasswordActive ? "text-[#1EA0DA]" : "text-slate-400 group-hover:text-slate-200"
              }`}
            />
            {!collapsed && <span>Password</span>}
          </Link>

          <form action={logoutAction} className="w-full">
            <button
              type="submit"
              title={collapsed ? "Sign out" : undefined}
              aria-label={collapsed ? "Sign out" : undefined}
              className={`group flex w-full items-center gap-2.5 rounded-md py-1.5 text-xs font-medium text-slate-300 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left ${
                collapsed ? "justify-center px-2" : "px-2.5"
              }`}
            >
              <IconSignOut className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-red-400 transition-colors" />
              {!collapsed && <span>Sign out</span>}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
