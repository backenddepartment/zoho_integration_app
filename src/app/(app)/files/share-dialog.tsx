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
          <h2 className="flex items-center gap-2 text-lg font-semibold break-all">
            Share {data ? `“${data.name}”` : <Bone className="h-5 w-40" />}
          </h2>
          <button onClick={() => ref.current?.close()} aria-label="Close" className="rounded px-2 text-xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            ×
          </button>
        </header>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!data && !error && <ShareSkeleton />}

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
                <div className="flex flex-wrap items-start gap-2">
                  <PersonCombobox
                    query={query}
                    onQuery={setQuery}
                    options={candidates}
                    chosen={chosen ?? null}
                    onChoose={(p) => {
                      setPersonId(p?.id ?? "");
                      setQuery("");
                    }}
                  />
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

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i, all) => (i === 0 || i === all.length - 1 ? w[0] : ""))
    .join("")
    .toUpperCase();

/**
 * Search and pick in one box: typing filters the people in a list that drops down under it
 * (arrow keys and Enter, or a click, to choose); the chosen person then sits in the box as a
 * chip, with × to clear.
 */
function PersonCombobox({
  query,
  onQuery,
  options,
  chosen,
  onChoose,
}: {
  query: string;
  onQuery: (q: string) => void;
  options: Person[];
  chosen: Person | null;
  onChoose: (p: Person | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const shown = options.slice(0, 50);
  const activeIndex = Math.min(active, Math.max(shown.length - 1, 0));

  // Keep the highlighted option in view while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const choose = (p: Person) => {
    onChoose(p);
    setOpen(false);
  };

  if (chosen) {
    return (
      <div className={`${input} flex min-h-[38px] min-w-0 flex-[2] items-center gap-2 !py-1`}>
        <span className="avatar h-6 w-6 text-[10px]">{initialsOf(chosen.name)}</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{chosen.name}</span> <span className="text-zinc-500">{chosen.email}</span>
        </span>
        <button
          type="button"
          aria-label={`Remove ${chosen.name}`}
          onClick={() => {
            onChoose(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="rounded-full px-1.5 text-lg leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-[2]">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls="share-people"
        aria-autocomplete="list"
        aria-activedescendant={open && shown[activeIndex] ? `share-person-${shown[activeIndex].id}` : undefined}
        value={query}
        placeholder="Search a name or email"
        onChange={(e) => {
          onQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            if (shown.length) setActive((activeIndex + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
          } else if (e.key === "Enter" && open && shown[activeIndex]) {
            e.preventDefault();
            choose(shown[activeIndex]);
          } else if (e.key === "Escape" && open) {
            // Close just the list, not the whole dialog.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={`${input} w-full pr-9`}
      />
      <svg
        viewBox="0 0 24 24"
        className={`pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>

      {open && (
        <ul
          ref={listRef}
          id="share-people"
          role="listbox"
          // Picking with the mouse mustn't blur the input (which closes the list) before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full right-0 left-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">{query ? `No one matches “${query}”.` : "Everyone already has access."}</li>
          ) : (
            shown.map((p, i) => (
              <li
                key={p.id}
                id={`share-person-${p.id}`}
                data-index={i}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${i === activeIndex ? "bg-[var(--tint)]" : ""}`}
              >
                <span className="avatar h-7 w-7 text-[10.5px]">{initialsOf(p.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{p.email}</span>
                </span>
                {p.role === "external" && <span className="shrink-0 text-xs text-amber-600">external</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** A grey placeholder block that pulses while the dialog loads. */
function Bone({ className }: { className: string }) {
  return <span aria-hidden="true" className={`inline-block animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

/** The dialog's shape while its people load: the add row, a few people, and Done, as grey blocks. */
function ShareSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span className="sr-only">Loading sharing settings…</span>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Add people</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Bone className="h-9 min-w-0 flex-[2]" />
          <Bone className="h-9 w-24" />
          <Bone className="h-9 w-16" />
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">People with access</h3>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {["w-28", "w-36", "w-24"].map((w, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <Bone className="h-8 w-8 shrink-0 !rounded-full" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Bone className={`h-3.5 ${w}`} />
                <Bone className="h-3 w-44 max-w-full" />
              </span>
              <Bone className="h-9 w-24" />
            </li>
          ))}
        </ul>
      </section>
      <Bone className="h-4 w-40" />
      <div className="flex justify-end">
        <Bone className="h-9 w-16" />
      </div>
    </div>
  );
}
