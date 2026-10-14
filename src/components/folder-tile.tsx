import Link from "next/link";
import { useId, type MouseEvent, type ReactNode } from "react";

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
          <Link
            href={`/files/${id}`}
            title={name}
            className={`block truncate text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100 ${deleted ? "line-through" : ""}`}
          >
            {name}
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
