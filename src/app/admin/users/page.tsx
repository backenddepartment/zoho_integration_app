import { asc, count, eq } from "drizzle-orm";
import { Suspense } from "react";
import { db, grants, isAdminRole, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { buttonSecondary, fmtTime, input, Loading } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { updateUserAction } from "./actions";
import { CreateUserForm, ResetPasswordForm } from "./forms";

export const metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
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
      shares: count(grants.id),
    })
    .from(users)
    .leftJoin(grants, eq(grants.userId, users.id))
    .groupBy(users.id)
    .orderBy(asc(users.role), asc(users.name));

  return (
    <AppShell user={me}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
        <section className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Admins see and manage everything; deleting only marks items &quot;(Deleted)&quot;, which admins can restore. Superadmins can also delete permanently.
            Staff and external users see only what is shared with them (use Share on any folder or file). External users are capped at edit: they can never delete
            or move.
          </p>
          <CreateUserForm canCreateSuperadmin={isSuper} />
        </section>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-normal">User</th>
                <th className="py-2 pr-4 font-normal">Role / status</th>
                <th className="py-2 pr-4 font-normal">Shares</th>
                <th className="py-2 pr-4 font-normal">Last sign-in</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                  <td className="py-2 pr-4">
                    {u.name}
                    <div className="text-zinc-500">{u.email}</div>
                    {u.mustChangePassword && <div className="text-xs text-amber-600">must set password</div>}
                  </td>
                  <td className="py-2 pr-4">
                    <form action={updateUserAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="role" defaultValue={u.role} disabled={locked(u.id, u.role)} className={input}>
                        {(isSuper || u.role === "superadmin") && <option value="superadmin">superadmin</option>}
                        <option value="admin">admin</option>
                        <option value="staff">staff</option>
                        <option value="external">external</option>
                      </select>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" name="active" defaultChecked={u.active} disabled={locked(u.id, u.role)} /> active
                      </label>
                      {!locked(u.id, u.role) && <button className={buttonSecondary}>Save</button>}
                    </form>
                  </td>
                  <td className="py-2 pr-4">{isAdminRole(u.role) ? "all" : u.shares}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{fmtTime(u.lastLoginAt)}</td>
                  <td className="py-2 text-right whitespace-nowrap">{!locked(u.id, u.role) && <ResetPasswordForm userId={u.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}
