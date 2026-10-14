"use client";

import { useRouter } from "@/components/top-progress";
import { useEffect, useState } from "react";

/**
 * After the page shows the indexed state, asks the server to check WorkDrive for changes made there
 * directly. If anything changed the page re-renders; if the item itself was deleted in WorkDrive,
 * it moves to `goneTo`.
 */
export function LiveSync({ url, goneTo }: { url: string; goneTo?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "idle">("checking");

  useEffect(() => {
    let cancelled = false;
    fetch(url, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { exists?: boolean; changed?: boolean } | null) => {
        if (cancelled || !res) return;
        if (res.exists === false && goneTo) router.replace(goneTo);
        else if (res.changed) router.refresh();
      })
      .catch(() => {})
      .finally(() => !cancelled && setState("idle"));
    return () => {
      cancelled = true;
    };
  }, [url, goneTo, router]);

  return (
    <p aria-live="polite" className="h-0 text-right text-xs text-zinc-400">
      {state === "checking" ? "Checking WorkDrive for changes…" : ""}
    </p>
  );
}
