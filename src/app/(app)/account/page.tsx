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

  const passwordCard = (
    <section className="board flex flex-col gap-4 p-5" id="password">
      <div>
        <h2 className="m-0 text-base font-semibold text-[var(--ink)]">Change password</h2>
        <p className="m-0 mt-0.5 text-xs text-[var(--ink-3)]">
          {user.mustChangePassword ? "Choose your own password to replace the temporary one." : "Use a password you don't use anywhere else."}
        </p>
      </div>
      <PasswordForm />
    </section>
  );

  const profileCard = (
    <section className="board flex flex-col items-center gap-3 p-5 text-center">
      <span className="avatar h-16 w-16 text-xl">{initials(user.name)}</span>
      <div className="min-w-0 max-w-full">
        <h2 className="m-0 truncate text-base font-semibold text-[var(--ink)]">{user.name}</h2>
        <p className="m-0 truncate text-xs text-[var(--ink-3)]">{user.email}</p>
      </div>
      <span className="tag tag-info">{role}</span>
      <div className="facts mt-1 w-full grid-cols-1 text-left">
        <div>
          <small>Last sign-in</small>
          <b className="text-[13px]">{row?.lastLoginAt ? fmtTime(row.lastLoginAt) : "—"}</b>
        </div>
        <div>
          <small>Member since</small>
          <b className="text-[13px]">{row ? fmtTime(row.createdAt) : "—"}</b>
        </div>
      </div>
    </section>
  );

  const editCard = (
    <section className="board flex flex-col gap-4 p-5">
      <div>
        <h2 className="m-0 text-base font-semibold text-[var(--ink)]">Edit profile</h2>
        <p className="m-0 mt-0.5 text-xs text-[var(--ink-3)]">Your name shows in the sidebar and next to the changes you make.</p>
      </div>
      <ProfileForm name={user.name} email={user.email} />
    </section>
  );

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 pt-6 pb-8">
        <header>
          <p className="eyebrow">Account</p>
          <h1 className="page-title">Your profile</h1>
        </header>

        {user.mustChangePassword && (
          <div className="alert alert-warn" role="status">
            <div>
              <b>Set your password first</b>
              You signed in with a temporary password. Choose your own before using the rest of the app.
            </div>
          </div>
        )}

        {/* Three cards side by side, so the whole page fits on one screen. */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {profileCard}
          {user.mustChangePassword ? passwordCard : editCard}
          {user.mustChangePassword ? editCard : passwordCard}
        </div>
      </main>
    </>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1];
  return `${parts[0]?.[0] ?? ""}${last ?? ""}`.toUpperCase();
}
