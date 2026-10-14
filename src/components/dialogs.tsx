"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

// In-app replacements for window.prompt / confirm / alert: centred modals, opened from anywhere
// with a promise. <DialogHost /> (mounted once, in AppShell) shows them one at a time.

// Matches --animate-dialog-out / --animate-backdrop-out in globals.css.
const EXIT_MS = 150;

type Action = { label: string; value: string; primary?: boolean; danger?: boolean };
type Request = {
  id: number;
  title: string;
  message?: ReactNode;
  /** Shows a text field; its value is returned with the chosen action. */
  input?: { label?: string; initial?: string; placeholder?: string; mustMatch?: string };
  actions: Action[];
  resolve: (r: { value: string; text: string } | null) => void;
};

let queue: Request[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const current = () => queue[0] ?? null;

function open(req: Omit<Request, "id" | "resolve">) {
  return new Promise<{ value: string; text: string } | null>((resolve) => {
    queue = [...queue, { ...req, id: nextId++, resolve }];
    emit();
  });
}

/** Asks for a line of text. Resolves to the trimmed text, or null if cancelled or left empty. */
export async function askText(opts: { title: string; message?: ReactNode; label?: string; initial?: string; placeholder?: string; confirmLabel?: string }) {
  const r = await open({
    title: opts.title,
    message: opts.message,
    input: { label: opts.label, initial: opts.initial, placeholder: opts.placeholder },
    actions: [{ label: opts.confirmLabel ?? "OK", value: "ok", primary: true }],
  });
  const text = r?.text.trim();
  return text ? text : null;
}

/** Asks yes or no. `danger` paints the confirm button red. */
export async function askConfirm(opts: { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }) {
  const r = await open({
    title: opts.title,
    message: opts.message,
    actions: [{ label: opts.confirmLabel ?? "OK", value: "ok", primary: true, danger: opts.danger }],
  });
  return r !== null;
}

/** Confirms by typing an exact phrase; the button stays disabled until it matches. */
export async function askTyped(opts: { title: string; message?: ReactNode; phrase: string; label?: string; confirmLabel: string }) {
  const r = await open({
    title: opts.title,
    message: opts.message,
    input: { label: opts.label, mustMatch: opts.phrase },
    actions: [{ label: opts.confirmLabel, value: "ok", primary: true, danger: true }],
  });
  return r !== null;
}

/** Offers several choices besides Cancel. Resolves to the chosen value, or null. */
export async function askChoice(opts: { title: string; message?: ReactNode; choices: Action[] }) {
  const r = await open({ title: opts.title, message: opts.message, actions: opts.choices });
  return r?.value ?? null;
}

/** A message with just an OK button. */
export async function notify(opts: { title: string; message?: ReactNode }) {
  await open({ title: opts.title, message: opts.message, actions: [] });
}

export function DialogHost() {
  const req = useSyncExternalStore(subscribe, current, () => null);
  const pathname = usePathname();
  const shownOn = useRef(pathname);

  // A link inside a modal took us to another page: dismiss whatever is open.
  useEffect(() => {
    if (shownOn.current === pathname) return;
    shownOn.current = pathname;
    if (!queue.length) return;
    const open = queue;
    queue = [];
    open.forEach((r) => r.resolve(null));
    emit();
  }, [pathname]);

  if (!req) return null;
  // Keyed so each request gets fresh state.
  return createPortal(<Dialog key={req.id} req={req} />, document.body);
}

function Dialog({ req }: { req: Request }) {
  const [text, setText] = useState(req.input?.initial ?? "");
  const [closing, setClosing] = useState<{ value: string; text: string } | null | undefined>(undefined);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const pressedBackdrop = useRef(false);

  const mustMatch = req.input?.mustMatch;
  const blocked = mustMatch !== undefined && text !== mustMatch;
  const cancelOnly = req.actions.length === 0;

  // Plays the exit animation, then hands the answer back and shows the next request, if any.
  // Timed rather than waiting for animationend, so it closes even with animations off.
  const finish = (result: { value: string; text: string } | null) => {
    if (closing !== undefined) return;
    setClosing(result);
    setTimeout(() => {
      queue = queue.slice(1);
      req.resolve(result);
      emit();
    }, EXIT_MS);
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (field.current) {
      field.current.focus();
      field.current.select();
    } else {
      panel.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus();
    }
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    const primary = req.actions.find((a) => a.primary) ?? req.actions[0];
    finish(primary ? { value: primary.value, text } : null);
  };

  const out = closing !== undefined;
  return (
    <div
      className={`fixed inset-0 z-[1000] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px] motion-reduce:animate-none ${
        out ? "animate-backdrop-out motion-reduce:opacity-0" : "animate-backdrop-in"
      }`}
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) finish(null);
        pressedBackdrop.current = false;
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,0.22)] motion-reduce:animate-none dark:bg-zinc-900 ${
          out ? "animate-dialog-out" : "animate-dialog-in"
        }`}
      >
        <form onSubmit={submit} className="flex flex-col gap-4 font-medium">
          <h2 id="dialog-title" className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            {req.title}
          </h2>
          {req.message && <div className="-mt-2 text-sm leading-relaxed whitespace-pre-line text-zinc-600 dark:text-zinc-400">{req.message}</div>}
          {req.input && (
            <label className="flex flex-col gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              {req.input.label}
              <input
                ref={field}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={req.input.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition-shadow focus:border-[#1EA0DA] focus:ring-4 focus:ring-[#1EA0DA]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          )}
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            {cancelOnly ? (
              <button type="button" data-primary onClick={() => finish(null)} className={primaryClass(false)}>
                OK
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => finish(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                {req.actions.map((a) =>
                  a.primary ? (
                    <button key={a.value} type="submit" data-primary disabled={blocked} className={primaryClass(!!a.danger)}>
                      {a.label}
                    </button>
                  ) : (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => finish({ value: a.value, text })}
                      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {a.label}
                    </button>
                  ),
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const primaryClass = (danger: boolean) =>
  `rounded-lg px-4 py-2 text-sm font-medium text-white outline-none transition-[color,background-color,box-shadow] focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${
    danger ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-600/25" : "bg-[#1D9FDA] hover:bg-[#1790c5] focus-visible:ring-[#1EA0DA]/25"
  }`;
