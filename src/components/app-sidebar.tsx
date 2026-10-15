"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType, type SVGProps } from "react";
import { isAdminRole } from "@/db/roles";
import type { CurrentUser } from "@/lib/auth";
import type { NavPlace } from "./app-shell-client";
import { FileIcon } from "./file-icon";
import { FolderGlyph } from "./folder-tile";
import { IconClose, IconFiles, IconSidebar, IconTrash, IconUsers, IconWorkDrive } from "./icons";

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

function IconHome(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconTeam(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <circle cx="12" cy="12.5" r="2" />
      <path d="M8.5 17.5a3.5 3.5 0 0 1 7 0" />
    </svg>
  );
}

function IconGear(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** One folder (or shared file) in the tree under Team Folders / Shared with me. */
function TreeItem({ place, active, onNavigate }: { place: NavPlace; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={`/files/${place.id}`}
      onClick={onNavigate}
      title={place.name}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-md py-1.5 pr-2 pl-8 text-[13px] transition-colors ${
        active ? "bg-[#1EA0DA]/20 font-medium text-white" : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      {place.kind === "file" ? (
        <FileIcon name={place.name} className="h-4 w-3.5 shrink-0" />
      ) : (
        <span className="w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4">
          <FolderGlyph id={place.id} />
        </span>
      )}
      <span className="truncate">{place.name}</span>
    </Link>
  );
}

/** A heading that opens and closes the list under it, like WorkDrive's "Team Folders". */
function TreeSection({
  label,
  icon: Icon,
  href,
  open,
  onToggle,
  active,
  collapsed,
  onNavigate,
  children,
}: {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
  open: boolean;
  onToggle: () => void;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  // Icons only: no tree, the icon goes to the list of them.
  if (collapsed) return <NavItem href={href} label={label} icon={Icon} active={active} collapsed onNavigate={onNavigate} />;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-200" />
        <span className="flex-1">{label}</span>
        <Chevron open={open} />
      </button>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}

export function AppSidebar({
  user,
  nav,
  activeId,
  onCloseMobile,
  collapsed = false,
  onToggleCollapsed,
}: {
  user: CurrentUser;
  nav: NavPlace[];
  activeId?: string;
  onCloseMobile?: () => void;
  /** Icons only, no labels (desktop). */
  collapsed?: boolean;
  /** Shows the collapse/expand button when given. */
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();

  const isHomeActive = pathname === "/files";
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const [treeOpen, setTreeOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(isAdminArea);
  const isActivePlace = (id: string) => id === activeId || pathname === `/files/${id}`;
  const myFolders = nav.filter((p) => p.kind === "myfolder");
  const shared = nav.filter((p) => p.kind !== "myfolder");
  const isUsersActive = pathname === "/admin/users" || pathname.startsWith("/admin/users/");
  const isDeletedActive = pathname === "/admin/deleted" || pathname.startsWith("/admin/deleted/");
  const isWorkDriveActive = pathname === "/admin";

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
        {/* Name only; collapsed, the header holds just the expand button. */}
        {!collapsed && (
          <Link href="/files" onClick={onCloseMobile} className="flex min-w-0 flex-col leading-tight group">
            <span className="font-semibold text-[15px] text-white tracking-tight group-hover:text-[#38BDF8] transition-colors">
              Getmeds Files
            </span>
            <span className="text-xs text-slate-400 font-medium">Zoho WorkDrive</span>
          </Link>
        )}
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
      {/* Navigation, laid out like WorkDrive's: home, My Folders, then the Team Folders tree */}
      {/* A thin gray scrollbar on the sidebar's own background, not the browser's white one. */}
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-0.5 [scrollbar-width:thin] [scrollbar-color:#4b5563_transparent] ${collapsed ? "px-2" : "px-2.5"}`}>
        <NavItem href="/files" label={isAdmin ? "All files" : "Home"} icon={IconHome} active={isHomeActive} collapsed={collapsed} onNavigate={onCloseMobile} />
        {myFolders.map((p) => (
          <NavItem
            key={p.id}
            href={`/files/${p.id}`}
            label={myFolders.length > 1 ? p.name : "My Folders"}
            icon={IconFiles}
            active={isActivePlace(p.id)}
            collapsed={collapsed}
            onNavigate={onCloseMobile}
          />
        ))}
        {shared.length > 0 && (
          <div className="pt-3">
            <TreeSection
              label={isAdmin ? "Team Folders" : "Shared with me"}
              icon={IconTeam}
              href="/files"
              open={treeOpen}
              onToggle={() => setTreeOpen((o) => !o)}
              active={shared.some((p) => isActivePlace(p.id))}
              collapsed={collapsed}
              onNavigate={onCloseMobile}
            >
              {shared.map((p) => (
                <TreeItem key={p.id} place={p} active={isActivePlace(p.id)} onNavigate={onCloseMobile} />
              ))}
            </TreeSection>
          </div>
        )}
      </nav>

      {/* Admin Console, pinned at the bottom like WorkDrive's (the profile is in the top-right corner) */}
      {isAdmin && (
        <div className={`border-t border-[#243347] pt-2.5 pb-4 ${collapsed ? "px-2 space-y-0.5" : "px-2.5"}`}>
          {collapsed ? (
            <>
              <NavItem href="/admin/users" label="Users" icon={IconUsers} active={isUsersActive} collapsed onNavigate={onCloseMobile} />
              <NavItem href="/admin/deleted" label="Deleted items" icon={IconTrash} active={isDeletedActive} collapsed onNavigate={onCloseMobile} />
              <NavItem href="/admin" label="WorkDrive" icon={IconWorkDrive} active={isWorkDriveActive} collapsed onNavigate={onCloseMobile} />
            </>
          ) : (
            <>
              {adminOpen && (
                <div className="mb-1 space-y-0.5">
                  <NavItem href="/admin/users" label="Users" icon={IconUsers} active={isUsersActive} collapsed={false} onNavigate={onCloseMobile} />
                  <NavItem href="/admin/deleted" label="Deleted items" icon={IconTrash} active={isDeletedActive} collapsed={false} onNavigate={onCloseMobile} />
                  <NavItem href="/admin" label="WorkDrive" icon={IconWorkDrive} active={isWorkDriveActive} collapsed={false} onNavigate={onCloseMobile} />
                </div>
              )}
              <button
                type="button"
                onClick={() => setAdminOpen((o) => !o)}
                aria-expanded={adminOpen}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                  isAdminArea ? "bg-white/[0.09] text-white" : "bg-white/[0.04] text-slate-200 hover:bg-white/[0.09] hover:text-white"
                }`}
              >
                <IconGear className="h-4 w-4 shrink-0 text-slate-300" />
                <span className="flex-1">Admin Console</span>
                <span className={`transition-transform ${adminOpen ? "" : "rotate-180"}`}>
                  <Chevron open />
                </span>
              </button>
            </>
          )}
        </div>
      )}

    </aside>
  );
}
