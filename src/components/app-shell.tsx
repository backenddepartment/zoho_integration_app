import { displayName } from "@/db";
import { entryPoints } from "@/lib/access";
import type { CurrentUser } from "@/lib/auth";
import { AppShellClient, type NavPlace } from "./app-shell-client";

/**
 * The frame around every signed-in page: the sidebar (with the user's folders, as in WorkDrive's
 * My Folders / Team Folders tree), the top bar, and the page. Rendered once by the (app) layout.
 */
export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const places = await entryPoints(user);
  const nav: NavPlace[] = places.map((p) => ({
    id: p.id,
    name: displayName(p.name),
    kind: p.rootKind ?? (p.kind === "file" ? "file" : "folder"),
  }));
  return (
    <AppShellClient user={user} nav={nav}>
      {children}
    </AppShellClient>
  );
}
