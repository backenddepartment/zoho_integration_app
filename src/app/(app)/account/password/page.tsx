import { redirect } from "next/navigation";

// It only redirects, so there is nothing to show instantly.
export const instant = false;

// Changing the password moved onto the profile page; keep old links working.
export default function PasswordPage() {
  redirect("/account#password");
}
