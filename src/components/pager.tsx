import Link from "next/link";
import type { ReactNode } from "react";

/** Page numbers to show: the first, the last, and two either side of the current one, with gaps as null. */
function pageList(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

/** "1–15 of 230" and ‹ 1 2 3 … › links, for the bottom of a table card. `href(n)` builds the link to page n. */
export function Pager({ page, perPage, total, href }: { page: number; perPage: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const step = (n: number, label: string, children: ReactNode) =>
    n < 1 || n > pages ? (
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-3)] opacity-40">
        {children}
      </span>
    ) : (
      <Link href={href(n)} scroll={false} aria-label={label} className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-2)] hover:bg-[var(--tint)]">
        {children}
      </Link>
    );

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] px-5 py-3 text-[13px] text-[var(--ink-3)]">
      <span>
        {from}–{to} of {total}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          {step(page - 1, "Previous page", <Chevron flip />)}
          {pageList(page, pages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : n === page ? (
              <span key={n} aria-current="page" className="grid h-8 min-w-8 place-items-center rounded-full bg-[var(--brand)] px-2 font-medium text-white">
                {n}
              </span>
            ) : (
              <Link key={n} href={href(n)} scroll={false} className="grid h-8 min-w-8 place-items-center rounded-full px-2 text-[var(--ink-2)] hover:bg-[var(--tint)]">
                {n}
              </Link>
            ),
          )}
          {step(page + 1, "Next page", <Chevron />)}
        </div>
      )}
    </nav>
  );
}

function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${flip ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
