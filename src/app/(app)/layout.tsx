import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingScreen } from "@/components/loading-screen";
import { getCurrentUser } from "@/lib/auth";

// The signed-in part of the app. The sidebar and top bar live here, in a layout shared by every
// page under it, so they stay on screen while moving between pages; only the page area shows
// its loading.tsx.

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    // Reading the session can't be prerendered, so the frame streams in behind this on first load.
    <Suspense fallback={<LoadingScreen title="Signing you in" steps={["Connecting", "Session", "Ready"]} fullPage />}>
      <Frame>{children}</Frame>
    </Suspense>
  );
}

async function Frame({ children }: { children: React.ReactNode }) {
  // Pages still check for themselves (requireUser also sends a temporary password to /account).
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AppShell user={user}>{children}</AppShell>;
}
