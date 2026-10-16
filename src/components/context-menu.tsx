"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean } | "separator";

type OpenMenu = (x: number, y: number, items: MenuItem[]) => void;
const Ctx = createContext<OpenMenu>(() => {});

/** Starts a file download from the API without leaving the page. */
export function startDownload(id: string) {
  const a = document.createElement("a");
  a.href = `/api/files/${id}/download`;
  a.click();
}

/** Opens a menu at a point, e.g. from onContextMenu or a "⋯" button. */
export const useContextMenu = () => useContext(Ctx);

/**
 * A button that drops a menu down from under it, like WorkDrive's "Manage ▾" and "New ▾".
 * Needs a ContextMenuProvider above it.
 */
export function MenuButton({
  label,
  items,
  icon,
  primary = false,
  disabled = false,
  compact = false,
  className = "",
}: {
  label: string;
  items: MenuItem[];
  icon?: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  /** On phones, just the icon and arrow (the label stays for screen readers). */
  compact?: boolean;
  className?: string;
}) {
  const open = useContextMenu();
  return (
    <button
      type="button"
      aria-haspopup="menu"
      disabled={disabled}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        open(primary ? r.right - 192 : r.left, r.bottom + 6, items);
      }}
      aria-label={label}
      className={`btn btn-sm shrink-0 gap-1.5 ${className} ${primary ? "btn-primary !bg-[var(--brand)] hover:!bg-[var(--accent-deep)] !text-white" : "btn-secondary !border-[var(--outline)]"}`}
    >
      {icon}
      <span className={compact ? "max-sm:sr-only" : undefined}>{label}</span>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-80" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

/** Hosts one floating menu for everything inside it. */
export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const open = useCallback<OpenMenu>((x, y, items) => {
    setPos(null);
    setMenu({ x, y, items });
  }, []);
  const close = useCallback(() => setMenu(null), []);

  // Keep the menu inside the viewport, flipping left/up near the edges.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
    const top = menu.y + height > window.innerHeight - 8 ? Math.max(8, menu.y - height) : menu.y;
    setPos({ left, top });
    ref.current.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, close]);

  return (
    <Ctx.Provider value={open}>
      {children}
      {menu && (
        <div
          ref={ref}
          role="menu"
          style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
          className="fixed z-50 min-w-48 rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.items.map((item, i) =>
            item === "separator" ? (
              <div key={i} className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={`block w-full px-4 py-1.5 text-left outline-none hover:bg-zinc-100 focus:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800 ${item.danger ? "text-red-600" : ""}`}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
