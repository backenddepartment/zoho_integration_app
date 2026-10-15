import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, users } from "@/db";
import { fmtTime } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Your profile" };
// The page reads the signed-in user, so it can't be instant; loading.tsx beside it shows
// the loading page meanwhile.
export const instant = false;

export default function AccountPage() {
  return <Content />;
}

async function Content() {
  // Not requireUser(): people who must change their password are sent here, so it has to let them in.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [row] = await db().select({ lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users).where(eq(users.id, user.id));
  const role = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  const passwordSection = (
    <section className="flex flex-col gap-4 border-t border-[var(--rule)] py-8" id="password">
      <div>
        <h2 className="m-0 text-base font-semibold text-[var(--ink)]">Change password</h2>
        <p className="m-0 mt-0.5 text-xs text-[var(--ink-3)]">
          {user.mustChangePassword ? "Choose your own password to replace the temporary one." : "Use a password you don't use anywhere else."}
        </p>
      </div>
      <PasswordForm />
    </section>
  );

  const editSection = (
    <section className="flex flex-col gap-4 border-t border-[var(--rule)] py-8">
      <div>
        <h2 className="m-0 text-base font-semibold text-[var(--ink)]">Edit profile</h2>
        <p className="m-0 mt-0.5 text-xs text-[var(--ink-3)]">Your name shows in the sidebar and next to the changes you make.</p>
      </div>
      <ProfileForm name={user.name} email={user.email} />
    </section>
  );

  return (
    <>
      {/* One column, top to bottom: who you are, then the forms, split by rules rather than cards. */}
      <main className="flex w-full flex-col px-6 pt-6 pb-8">
        <header className="pb-6">
          <p className="eyebrow">Account</p>
          <h1 className="page-title">Your profile</h1>
        </header>

        {user.mustChangePassword && (
          <div className="alert alert-warn mb-6" role="status">
            <div>
              <b>Set your password first</b>
              You signed in with a temporary password. Choose your own before using the rest of the app.
            </div>
          </div>
        )}

        {/* Spans the full width in four columns: who you are over the left half (lined up with the
            forms' first column), the two dates sharing the right half. */}
        <section className="grid items-center gap-x-8 gap-y-5 pb-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 items-center gap-4 sm:col-span-2">
            <span className="avatar h-16 w-16 shrink-0 text-xl">{initials(user.name)}</span>
            <div className="min-w-0">
              <h2 className="m-0 truncate text-base font-semibold text-[var(--ink)]">{user.name}</h2>
              <p className="m-0 truncate text-xs text-[var(--ink-3)]">{user.email}</p>
              <span className="tag tag-info mt-1.5">{role}</span>
            </div>
          </div>
          <div>
            <p className="m-0 text-xs text-[var(--ink-3)]">Last sign-in</p>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[var(--ink)]">{row?.lastLoginAt ? fmtTime(row.lastLoginAt) : "—"}</p>
          </div>
          <div>
            <p className="m-0 text-xs text-[var(--ink-3)]">Member since</p>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[var(--ink)]">{row ? fmtTime(row.createdAt) : "—"}</p>
          </div>
        </section>

        {user.mustChangePassword ? passwordSection : editSection}
        {user.mustChangePassword ? editSection : passwordSection}
      </main>
    </>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1];
  return `${parts[0]?.[0] ?? ""}${last ?? ""}`.toUpperCase();
}
