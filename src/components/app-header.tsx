import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { isAdminRole } from "@/db/roles";
import type { CurrentUser } from "@/lib/auth";

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/files" className="font-semibold">
          Getmeds Files
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/files" className="hover:underline">
            Files
          </Link>
          {isAdminRole(user.role) && (
            <>
              <Link href="/admin/users" className="hover:underline">
                Users
              </Link>
              <Link href="/admin/deleted" className="hover:underline">
                Deleted items
              </Link>
              <Link href="/admin" className="hover:underline">
                WorkDrive
              </Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            {user.name} · {user.role}
          </span>
          <Link href="/account/password" className="hover:underline">
            Password
          </Link>
          <form action={logoutAction}>
            <button className="hover:underline">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
