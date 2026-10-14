import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password" };

export default function PasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-16">
        <h1 className="mb-1 text-2xl font-semibold">Change password</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          {user.mustChangePassword ? "Choose your own password before continuing." : `Signed in as ${user.email}.`}
        </p>
        <PasswordForm />
      </main>
    </AppShell>
  );
}
