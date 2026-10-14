"use client";

import { usePathname, useRouter as useNextRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

// A YouTube-style loading line across the top of the screen while the next page loads.
// It starts on a click on an internal link, or on push/replace through useRouter() below,
// creeps towards 90%, and completes once the path has changed and no <ProgressHold /> (the
// pages' loading placeholders) is still showing.

const starters = new Set<() => void>();
const finishers = new Set<() => void>();
let holds = 0;

/** Starts the line; for navigations that don't go through a link or useRouter() below. */
export function startProgress() {
  starters.forEach((start) => start());
}

/** next/navigation's useRouter, with push and replace starting the line. */
export function useRouter() {
  const router = useNextRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        if (leavesPage(args[0])) startProgress();
        router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        if (leavesPage(args[0])) startProgress();
        router.replace(...args);
      },
    }),
    [router],
  );
}

/** True when going to `href` loads a different page (not just a hash or the same URL). */
function leavesPage(href: string) {
  const to = new URL(href, window.location.href);
  return to.origin === window.location.origin && (to.pathname !== window.location.pathname || to.search !== window.location.search);
}

export function TopProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<{ trickle?: ReturnType<typeof setInterval>; hide?: ReturnType<typeof setTimeout>; giveUp?: ReturnType<typeof setTimeout> }>({});
  const running = useRef(false);

  useEffect(() => {
    const t = timers.current;
    const stopTimers = () => {
      clearInterval(t.trickle);
      clearTimeout(t.hide);
      clearTimeout(t.giveUp);
    };
    const start = () => {
      if (running.current) return;
      stopTimers();
      running.current = true;
      setVisible(true);
      // Jumps straight to a quarter so the click feels answered at once, rushes to ~70%,
      // then crawls towards 95% so a long load never looks finished.
      setProgress(0.25);
      t.trickle = setInterval(
        () => setProgress((p) => (p < 0.7 ? p + (0.8 - p) * 0.22 : p + (0.95 - p) * 0.035)),
        100,
      );
      // Never leave it hanging if the navigation is cancelled or fails.
      t.giveUp = setTimeout(() => finish(), 15_000);
    };
    const finish = () => {
      if (!running.current) return;
      running.current = false;
      stopTimers();
      setProgress(1);
      // Zip to the end, fade out, then reset once it's invisible.
      t.hide = setTimeout(() => {
        setVisible(false);
        t.hide = setTimeout(() => setProgress(0), 250);
      }, 200);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      if (leavesPage(a.href) && !a.pathname.startsWith("/api/")) start();
    };

    starters.add(start);
    finishers.add(finish);
    document.addEventListener("click", onClick, true);
    return () => {
      starters.delete(start);
      finishers.delete(finish);
      document.removeEventListener("click", onClick, true);
      stopTimers();
    };
  }, []);

  // The new page is showing. Checked a moment later so a loading placeholder on it has mounted.
  useEffect(() => {
    const id = setTimeout(() => holds === 0 && finishers.forEach((finish) => finish()), 50);
    return () => clearTimeout(id);
  }, [pathname]);

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[2000] h-[3px] overflow-hidden">
        {/* Slid in from the left rather than scaled, so the glowing tip at its end keeps its shape. */}
        <div
          className="relative h-full bg-gradient-to-r from-[#12769f] via-[#1EA0DA] to-[#5cc8f5] transition-[transform,opacity] duration-200 ease-out"
          style={{ transform: `translateX(${(progress - 1) * 100}%)`, opacity: visible ? 1 : 0 }}
        >
          <div className="absolute inset-0 animate-progress-shimmer bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.65)_50%,transparent_100%)] bg-[length:40%_100%] bg-no-repeat" />
          <div className="absolute -top-1 right-0 h-[11px] w-28 rounded-full shadow-[0_0_10px_#1EA0DA,0_0_5px_#1EA0DA]" />
        </div>
      </div>
    </>
  );
}

/** Keeps the line running while it's on screen; put it in loading placeholders. */
export function ProgressHold() {
  useEffect(() => {
    holds++;
    startProgress();
    return () => {
      holds--;
      if (holds === 0) finishers.forEach((finish) => finish());
    };
  }, []);
  return null;
}
