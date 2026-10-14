"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

/**
 * A tile's name, cut to one line (or `lines={2}`). When it doesn't fit, hovering the tile (`.group`)
 * shows the whole name in a small label floating over it, so the grid below doesn't move.
 */
export function TileName({ name, lines = 1, center = false, struck = false }: { name: string; lines?: 1 | 2; center?: boolean; struck?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [name]);

  return (
    <span className="relative block">
      <span
        ref={ref}
        // line-clamp sets its own display, so `block` only goes with the one-line version.
        className={`text-sm font-medium text-[var(--ink)] ${lines === 1 ? "block truncate" : "line-clamp-2 break-words"} ${center ? "text-center" : ""} ${struck ? "line-through" : ""}`}
      >
        {name}
      </span>
      {clipped && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-x-2 -top-1.5 z-20 hidden rounded-lg bg-[var(--canvas)] px-2 py-1.5 text-[12.5px] leading-snug font-medium break-words text-[var(--ink)] shadow-[0_8px_24px_rgba(0,0,0,0.14)] ring-1 ring-[var(--rule)] group-hover:block ${center ? "text-center" : ""}`}
        >
          {name}
        </span>
      )}
    </span>
  );
}

// [front, back] per colour; the back panel and tab are a shade darker than the front.
const FOLDER_COLORS: [string, string][] = [
  ["#A855F7", "#7E22CE"], // purple
  ["#3B82F6", "#1D4ED8"], // blue
  ["#10B981", "#047857"], // green
  ["#F59E0B", "#B45309"], // amber
  ["#EC4899", "#BE185D"], // pink
  ["#14B8A6", "#0F766E"], // teal
  ["#F97316", "#C2410C"], // orange
  ["#6366F1", "#4338CA"], // indigo
];

/** A stable colour per folder, so it looks the same on every visit. */
export function folderColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return FOLDER_COLORS[Math.abs(h) % FOLDER_COLORS.length];
}

function FolderArt({ id }: { id: string }) {
  const [front, back] = folderColor(id);
  // Unique per tile and safe inside url(#…), whatever the folder id contains.
  const grad = `folder-shine-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 160 120" className="block h-auto w-full drop-shadow-sm" aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Back panel with its tab */}
      <rect x="4" y="6" width="62" height="24" rx="9" fill={back} />
      <rect x="4" y="16" width="152" height="100" rx="12" fill={back} />
      {/* Papers peeking out; on hover of the tile they rise out of the folder, the front one a bit more */}
      <g className="transition-transform duration-300 ease-out group-hover:-translate-y-[8px] motion-reduce:transition-none">
        <g transform="rotate(-6 70 50)">
          <rect x="22" y="26" width="92" height="56" rx="4" fill="#fff" opacity="0.92" />
          <rect x="32" y="38" width="48" height="4" rx="2" fill={back} opacity="0.35" />
          <rect x="32" y="48" width="64" height="4" rx="2" fill={back} opacity="0.25" />
        </g>
      </g>
      <g className="transition-transform delay-50 duration-300 ease-out group-hover:-translate-y-[13px] motion-reduce:transition-none">
        <g transform="rotate(4 100 50)">
          <rect x="56" y="24" width="90" height="56" rx="4" fill="#fff" />
          <rect x="66" y="36" width="56" height="4" rx="2" fill={back} opacity="0.35" />
          <rect x="66" y="46" width="70" height="4" rx="2" fill={back} opacity="0.25" />
          <rect x="66" y="56" width="44" height="4" rx="2" fill={back} opacity="0.25" />
        </g>
      </g>
      {/* Front panel */}
      <rect x="4" y="46" width="152" height="70" rx="12" fill={front} />
      <rect x="4" y="46" width="152" height="70" rx="12" fill={`url(#${grad})`} />
      <rect x="4" y="46" width="152" height="1.5" fill="#fff" opacity="0.35" />
    </svg>
  );
}

/** A folder as a coloured tile with its name underneath. */
export function FolderTile({
  id,
  name,
  detail,
  deleted = false,
  badge,
  onOptions,
  onContextMenu,
  onDoubleClick,
}: {
  id: string;
  name: string;
  /** Small line under the name (access level, last change, …). */
  detail?: ReactNode;
  deleted?: boolean;
  badge?: ReactNode;
  onOptions: (e: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (e: MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  return (
    <li data-row onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} className={`group relative flex flex-col gap-2 ${deleted ? "opacity-50" : ""}`}>
      <Link
        href={`/files/${id}`}
        className="block rounded-xl transition-transform duration-150 group-hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1EA0DA]"
          aria-label={name}
        >
          <FolderArt id={id} />
        </Link>
        <button
          aria-label={`Options for ${name}`}
          onClick={onOptions}
          className="absolute top-[44%] right-1.5 rounded-md px-1.5 py-0.5 text-lg leading-none font-bold text-white/90 hover:bg-white/20"
        >
          ⋮
        </button>
        <div className="min-w-0 px-0.5">
          <Link href={`/files/${id}`} className="block hover:underline">
            <TileName name={name} struck={deleted} />
          </Link>
          {(detail || badge) && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-500">
              {detail}
              {badge}
            </div>
          )}
        </div>
      </li>
    );
  }

  /** The grid the tiles sit in. */
  export function FolderGrid({ children }: { children: ReactNode }) {
    return <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-5 gap-y-6">{children}</ul>;
  }

/** A small folder in the same colour as its tile on the Files pages. */
export function FolderGlyph({ id }: { id: string }) {
  const [front, back] = folderColor(id);
  return (
    <svg viewBox="0 0 32 26" className="h-7 w-8 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="13" height="7" rx="2.5" fill={back} />
      <rect x="1" y="4" width="30" height="21" rx="3.5" fill={back} />
      <rect x="1" y="9" width="30" height="16" rx="3.5" fill={front} />
    </svg>
  );
}

/** A folder as a Google Drive-style card for list view: small folder, name, a detail line and ⋮, on a tint of the folder's colour. */
export function FolderChip({
  id,
  name,
  detail,
  deleted = false,
  badge,
  onOptions,
  onContextMenu,
  onDoubleClick,
}: {
  id: string;
  name: string;
  detail?: ReactNode;
  deleted?: boolean;
  badge?: ReactNode;
  onOptions: (e: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (e: MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  const [front] = folderColor(id);
  return (
    <li
      data-row
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      style={{ "--chip": front } as CSSProperties}
      className={`group relative flex items-center rounded-2xl bg-[color-mix(in_srgb,var(--chip)_13%,var(--canvas))] transition-colors hover:bg-[color-mix(in_srgb,var(--chip)_21%,var(--canvas))] ${deleted ? "opacity-50" : ""}`}
    >
      <Link href={`/files/${id}`} title={name} className="flex min-w-0 flex-1 items-center gap-3.5 py-3.5 pr-2 pl-4">
        <FolderGlyph id={id} />
        <span className="min-w-0">
          <span className={`line-clamp-2 text-sm font-medium break-words text-[var(--ink)] ${deleted ? "line-through" : ""}`}>{name}</span>
          {(detail || badge) && (
            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--ink-3)]">
              {detail}
              {badge}
            </span>
          )}
        </span>
      </Link>
      <button
        aria-label={`Options for ${name}`}
        onClick={onOptions}
        className="mr-2 shrink-0 rounded-full p-1.5 text-[var(--ink-2)] hover:bg-[color-mix(in_srgb,var(--chip)_28%,var(--canvas))]"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
    </li>
  );
}

/** The grid the folder cards sit in (list view). */
export function FolderChipGrid({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 p-0">{children}</ul>;
}
