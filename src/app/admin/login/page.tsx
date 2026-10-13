import { LoginForm } from "./login-form";

export const metadata = { title: "Admin sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-24">
      <h1 className="mb-6 text-2xl font-semibold">Admin sign in</h1>
      <LoginForm />
    </main>
  );
}
