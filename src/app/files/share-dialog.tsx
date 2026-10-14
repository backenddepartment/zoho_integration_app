"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { button, buttonSecondary, input, linkButton } from "@/components/ui";
import { ACCESS_ROLES } from "@/db/roles";

type Person = { id: string; name: string; email: string; role: string; maxLevel: number };
type Direct = { grantId: number; userId: string; name: string; email: string; role: string; level: number; label: string };
type Inherited = { userId: string; name: string; email: string; role: string; level: number; label: string; from: string; fromId: string };
type Sharing = {
  name: string;
  kind: string;
  canManageUsers: boolean;
  direct: Direct[];
  inherited: Inherited[];
  admins: { name: string; email: string; role: string }[];
  people: Person[];
};

async function fetchSharing(id: string): Promise<{ data: Sharing } | { error: string }> {
  const res = await fetch(`/api/files/${id}/sharing`);
  const body = await res.json().catch(() => ({}));
  return res.ok ? { data: body as Sharing } : { error: body.error ?? `Couldn't load sharing (HTTP ${res.status})` };
}

/** A WorkDrive-style Share dialog. `open(id)` shows it for that file or folder. */
export function useShareDialog() {
  const [id, setId] = useState<string | null>(null);
  const open = useCallback((itemId: string) => setId(itemId), []);
  const element = id ? <ShareDialog id={id} onClose={() => setId(null)} /> : null;
  return { open, element };
}

function ShareDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Sharing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState("");
  const [level, setLevel] = useState(1);

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchSharing>>) => ("error" in r ? setError(r.error) : setData(r.data)), []);
  const load = useCallback(async () => apply(await fetchSharing(id)), [id, apply]);

  useEffect(() => {
    ref.current?.showModal();
    let cancelled = false;
    fetchSharing(id).then((r) => !cancelled && apply(r));
    return () => {
      cancelled = true;
    };
  }, [id, apply]);

  async function send(method: "POST" | "DELETE", init: { body?: unknown; query?: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/files/${id}/sharing${init.query ?? ""}`, {
      method,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? `Failed (HTTP ${res.status})`);
    await load();
    router.refresh();
  }

  const directIds = new Set(data?.direct.map((d) => d.userId));
  const candidates = (data?.people ?? []).filter(
    (p) => !directIds.has(p.id) && (!query || `${p.name} ${p.email}`.toLowerCase().includes(query.toLowerCase())),
  );
  const chosen = data?.people.find((p) => p.id === personId);
  const roleOptions = (max: number) => ACCESS_ROLES.filter((r) => r.level <= max);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(640px,calc(100vw-32px))] rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex max-h-[85vh] flex-col gap-5 overflow-y-auto p-5">
        <header className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold break-all">Share {data ? `“${data.name}”` : "…"}</h2>
          <button onClick={() => ref.current?.close()} aria-label="Close" className="rounded px-2 text-xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            ×
          </button>
        </header>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!data && !error && <p className="text-sm text-zinc-500">Loading…</p>}

        {data && (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Add people</h3>
              {data.people.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  There are no staff or external accounts yet.{" "}
                  {data.canManageUsers ? (
                    <Link href="/admin/users" className="underline">
                      Create them on the Users page
                    </Link>
                  ) : (
                    "Ask an administrator to create them."
                  )}
                  {" "}Admins already have access to everything.
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className={`${input} min-w-0 flex-1`} />
                  <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={`${input} min-w-0 flex-1`}>
                    <option value="">Choose a person…</option>
                    {candidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.email}){p.role === "external" ? " · external" : ""}
                      </option>
                    ))}
                  </select>
                  <select value={Math.min(level, chosen?.maxLevel ?? 4)} onChange={(e) => setLevel(Number(e.target.value))} className={input}>
                    {roleOptions(chosen?.maxLevel ?? 4).map((r) => (
                      <option key={r.level} value={r.level}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !personId}
                    onClick={async () => {
                      await send("POST", { body: { userId: personId, level: Math.min(level, chosen?.maxLevel ?? 4) } });
                      setPersonId("");
                      setQuery("");
                    }}
                    className={button}
                  >
                    Share
                  </button>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">People with access</h3>
              <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {data.direct.map((d) => (
                  <li key={d.grantId} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      {d.name} <span className="text-zinc-500">{d.email}</span>
                      {d.role === "external" && <span className="ml-1 text-xs text-amber-600">external</span>}
                    </span>
                    <select
                      value={d.level}
                      disabled={busy}
                      onChange={(e) => send("POST", { body: { userId: d.userId, level: Number(e.target.value) } })}
                      className={input}
                    >
                      {roleOptions(d.role === "external" ? 2 : 4).map((r) => (
                        <option key={r.level} value={r.level}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button disabled={busy} onClick={() => send("DELETE", { query: `?grantId=${d.grantId}` })} className={linkButton}>
                      Remove
                    </button>
                  </li>
                ))}
                {data.inherited.map((g, i) => (
                  <li key={`i${i}`} className="flex flex-wrap items-center gap-2 py-2 text-zinc-600 dark:text-zinc-400">
                    <span className="min-w-0 flex-1">
                      {g.name} <span className="text-zinc-500">{g.email}</span>
                    </span>
                    <span>
                      {g.label} · from{" "}
                      <Link href={`/files/${g.fromId}`} className="underline">
                        {g.from}
                      </Link>
                    </span>
                  </li>
                ))}
                {data.admins.map((a) => (
                  <li key={a.email} className="flex flex-wrap items-center gap-2 py-2 text-zinc-600 dark:text-zinc-400">
                    <span className="min-w-0 flex-1">
                      {a.name} <span className="text-zinc-500">{a.email}</span>
                    </span>
                    <span>Everything ({a.role})</span>
                  </li>
                ))}
              </ul>
              {data.direct.length === 0 && data.inherited.length === 0 && <p className="text-sm text-zinc-500">Only admins can see this so far.</p>}
            </section>

            <details className="text-sm text-zinc-600 dark:text-zinc-400">
              <summary className="cursor-pointer">What each role can do</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {ACCESS_ROLES.map((r) => (
                  <li key={r.key}>
                    <b className="text-zinc-900 dark:text-zinc-100">{r.label}</b>: {r.can}.
                  </li>
                ))}
                <li>Access on a folder covers everything inside it. External users can be at most Editor.</li>
              </ul>
            </details>

            <footer className="flex justify-end">
              <button onClick={() => ref.current?.close()} className={buttonSecondary}>
                Done
              </button>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}

/** "Share" button for a file or folder page. */
export function ShareButton({ id }: { id: string }) {
  const share = useShareDialog();
  return (
    <>
      <button onClick={() => share.open(id)} className="btn btn-primary btn-sm">
        Share
      </button>
      {share.element}
    </>
  );
}
