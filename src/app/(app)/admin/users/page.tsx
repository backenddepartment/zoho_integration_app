import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, displayName, grants, isAdminRole, levelLabel, users, wdItems, wdRoots } from "@/db";
import { fmtTime } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { updateUserAction } from "./actions";
import { CreateUserForm, ResetPasswordForm } from "./forms";
import { SharesButton, type SharedItem } from "./shares-button";

export const metadata = { title: "Users" };
// The page reads the signed-in user, so it can't be instant; loading.tsx beside it shows
// the loading page meanwhile.
export const instant = false;

export default function UsersPage() {
  return <Content />;
}

async function Content() {
  const me = await requireAdmin();
  const isSuper = me.role === "superadmin";
  // You can't edit yourself here, and only superadmins can edit superadmins.
  const locked = (id: string, role: string) => id === me.id || (role === "superadmin" && !isSuper);
  const rows = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.role), asc(users.name));

  // What each person has been given. A grant points at a team folder (wd_roots) or at a folder or file inside one (wd_items).
  const itemRoot = alias(wdRoots, "item_root");
  const grantRows = await db()
    .select({
      userId: grants.userId,
      id: grants.resourceId,
      level: grants.level,
      itemName: wdItems.name,
      isFolder: wdItems.isFolder,
      extn: wdItems.extn,
      rootName: wdRoots.name,
      inRoot: itemRoot.name,
    })
    .from(grants)
    .leftJoin(wdItems, eq(wdItems.id, grants.resourceId))
    .leftJoin(wdRoots, eq(wdRoots.id, grants.resourceId))
    .leftJoin(itemRoot, eq(itemRoot.id, wdItems.rootId));
  const sharesOf = new Map<string, SharedItem[]>();
  for (const g of grantRows) {
    const item: SharedItem = {
      id: g.id,
      name: displayName(g.rootName ?? g.itemName ?? ""),
      kind: g.rootName ? "teamfolder" : g.itemName === null ? "gone" : g.isFolder ? "folder" : "file",
      extn: g.extn,
      where: g.rootName ? null : g.inRoot && displayName(g.inRoot),
      access: levelLabel(g.level),
    };
    sharesOf.set(g.userId, [...(sharesOf.get(g.userId) ?? []), item]);
  }
  sharesOf.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header>
          <p className="eyebrow">Administration</p>
          <h1 className="page-title">Users</h1>
          <p className="page-lead">
            Admins see and manage everything; deleting only marks items &quot;(Deleted)&quot;, which admins can restore. Superadmins can also delete permanently.
            Staff and external users see only what is shared with them (use Share on any folder or file). External users are capped at edit: they can never delete
            or move.
          </p>
        </header>

        <section className="board flex flex-col gap-4">
          <h2 className="section-title">Add a person</h2>
          <CreateUserForm canCreateSuperadmin={isSuper} />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="section-title">Everyone</h2>
            <span className="tag tag-mute">{rows.length}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role / status</th>
                  <th>Shares</th>
                  <th>Last sign-in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-who">
                        <span className="avatar">{initials(u.name)}</span>
                        <div className="min-w-0">
                          <span className="name whitespace-nowrap">{u.name}</span>
                          <span className="sub whitespace-nowrap">{u.email}</span>
                          {u.mustChangePassword && (
                            <span className="tag tag-warn mt-1.5">
                              <span className="dot" />
                              Must set password
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <form action={updateUserAction} className="flex flex-nowrap items-center gap-2.5">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" defaultValue={u.role} disabled={locked(u.id, u.role)} className="field-select field-xs w-[120px]" aria-label={`Role for ${u.name}`}>
                          {(isSuper || u.role === "superadmin") && <option value="superadmin">Superadmin</option>}
                          <option value="admin">Admin</option>
                          <option value="staff">Staff</option>
                          <option value="external">External</option>
                        </select>
                        <label className="switch switch-sm">
                          <input type="checkbox" name="active" defaultChecked={u.active} disabled={locked(u.id, u.role)} /> Active
                        </label>
                        {!locked(u.id, u.role) && <button className="btn btn-secondary btn-xs">Save</button>}
                      </form>
                    </td>
                    <td>{isAdminRole(u.role) ? <span className="tag tag-mute">All</span> : <SharesButton person={u.name} items={sharesOf.get(u.id) ?? []} />}</td>
                    <td className="whitespace-nowrap">{u.lastLoginAt ? <SignIn at={u.lastLoginAt} /> : <span className="sub">Never</span>}</td>
                    <td className="text-right whitespace-nowrap">{!locked(u.id, u.role) && <ResetPasswordForm userId={u.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

/** "Oct 14, 2026" over "12:51 PM", so the column stays narrow. */
function SignIn({ at }: { at: Date }) {
  const full = fmtTime(at);
  const cut = full.lastIndexOf(", ");
  return (
    <>
      {full.slice(0, cut)}
      <span className="sub">{full.slice(cut + 2)}</span>
    </>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1];
  return `${parts[0]?.[0] ?? ""}${last ?? ""}`.toUpperCase();
}
