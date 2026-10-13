import { asc, eq, notInArray } from "drizzle-orm";
import { db, grants, users } from "@/db";
import { button, input, linkButton } from "@/components/ui";
import { LEVEL_NAMES } from "@/lib/access";
import { addGrantAction, removeGrantAction } from "./actions";

/** Admin-only: who has access to this item directly. Access granted on a parent folder also applies here. */
export async function SharePanel({ resourceId }: { resourceId: string }) {
  const current = await db()
    .select({ id: grants.id, level: grants.level, name: users.name, email: users.email, role: users.role })
    .from(grants)
    .innerJoin(users, eq(users.id, grants.userId))
    .where(eq(grants.resourceId, resourceId))
    .orderBy(asc(users.name));
  const people = await db()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(notInArray(users.role, ["admin", "superadmin"]))
    .orderBy(asc(users.name));

  return (
    <section id="sharing" className="flex scroll-mt-4 flex-col gap-3 rounded border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h2 className="font-medium">Sharing</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Access given here covers everything inside. View: browse and download. Edit: also upload, new folders, rename. Manage: also delete and move. External
          users never get more than edit.
        </p>
      </div>

      {current.length === 0 ? (
        <p className="text-sm text-zinc-500">Not shared directly with anyone.</p>
      ) : (
        <ul className="text-sm">
          {current.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 py-1">
              <span>
                {g.name} <span className="text-zinc-500">({g.email}, {g.role})</span>
              </span>
              <span className="text-zinc-500">{LEVEL_NAMES[g.level]}</span>
              <form action={removeGrantAction}>
                <input type="hidden" name="grantId" value={g.id} />
                <button className={linkButton}>Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {people.length === 0 ? (
        <p className="text-sm text-zinc-500">Create staff or external users on the Users page to share with them.</p>
      ) : (
        <form action={addGrantAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="resourceId" value={resourceId} />
          <select name="userId" required className={input}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.role})
              </option>
            ))}
          </select>
          <select name="level" defaultValue="view" className={input}>
            <option value="view">view</option>
            <option value="edit">edit</option>
            <option value="manage">manage</option>
          </select>
          <button className={button}>Share</button>
        </form>
      )}
    </section>
  );
}
