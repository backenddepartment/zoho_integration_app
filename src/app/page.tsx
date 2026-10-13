import { redirect } from "next/navigation";

// Phase 3 replaces this with the user-facing file browser.
export default function Home() {
  redirect("/admin");
}
