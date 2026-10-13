import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-24">
      <h1 className="mb-1 text-2xl font-semibold">Getmeds Files</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">Sign in with the account your administrator gave you.</p>
      <LoginForm />
    </main>
  );
}
