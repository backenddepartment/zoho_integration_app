import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password" };

export default function PasswordPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Change password</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        {user.mustChangePassword ? "Choose your own password before continuing." : `Signed in as ${user.email}.`}
      </p>
      <PasswordForm />
    </>
  );
}
