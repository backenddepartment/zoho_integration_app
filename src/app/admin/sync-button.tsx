"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/sync", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { runId?: number; error?: string };
    setMessage(res.ok ? `Sync #${body.runId} started. Refresh to see progress.` : (body.error ?? `Failed (HTTP ${res.status})`));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={start} disabled={disabled || busy} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        Scan WorkDrive now
      </button>
      {message && <span className="text-sm text-zinc-600 dark:text-zinc-400">{message}</span>}
    </div>
  );
}
