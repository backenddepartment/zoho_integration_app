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
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={start} disabled={disabled || busy} className="btn btn-primary btn-sm">
        {busy ? "Starting…" : "Scan WorkDrive now"}
      </button>
      {message && <span className="text-sm text-[var(--ink-3)]">{message}</span>}
    </div>
  );
}
