"use client";

import { useEffect, useState } from "react";

// A step-by-step loader: ticked circles joined by lines, the current step ringed, the rest faint.
// Short named steps ticking over read as progress, so waits feel shorter than a spinner.

/** The steps; `done` is how many are finished (the next one is the current step). */
export function Stepper({ steps, done, compact = false }: { steps: string[]; done: number; compact?: boolean }) {
  return (
    <ol
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={steps.length}
      aria-valuenow={Math.min(done, steps.length)}
      aria-valuetext={done >= steps.length ? "Done" : steps[done]}
      className="m-0 flex list-none items-start p-0"
    >
      {steps.map((label, i) => {
        const state = i < done ? "done" : i === done ? "current" : "todo";
        const size = compact ? 20 : 24;
        return (
          // Every step the same fixed width, wide enough for its label, so labels never touch.
          <li key={label} className="relative flex shrink-0 flex-col items-center gap-1.5" style={{ width: compact ? 72 : 88 }}>
            {/* The line from this circle to the next one, filling in once this step is done */}
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute h-[2px] overflow-hidden rounded-full bg-[var(--rule)]"
                style={{ top: size / 2 - 1, left: `calc(50% + ${size / 2 + 6}px)`, right: `calc(-50% + ${size / 2 + 6}px)` }}
              >
                <span
                  className="absolute inset-0 origin-left bg-[var(--brand)] transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${i < done ? 1 : 0})` }}
                />
              </span>
            )}
            <span
                className={`relative flex shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${compact ? "h-5 w-5" : "h-6 w-6"} ${
                  state === "done"
                    ? "bg-[var(--brand)] text-white"
                    : state === "current"
                      ? "border-2 border-[var(--brand)] bg-[var(--canvas)]"
                      : "border-2 border-[var(--rule)] bg-[var(--canvas)]"
                }`}
              >
                {state === "done" && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-[step-pop_200ms_ease-out]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
                {state === "current" && <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand)]" />}
            </span>
            <span
              className={`w-full truncate px-1 text-center ${compact ? "text-[11px]" : "text-xs"} ${
                state === "todo" ? "text-[var(--ink-3)] opacity-70" : "font-medium text-[var(--ink-2)]"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Steps that tick over on their own while something loads that reports no progress: quick at
 * first, slower later, and never past the next-to-last step until `finished`.
 */
export function useSimulatedSteps(count: number, finished = false) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (finished) return;
    const delays = [180, 420, 900, 1800, 3500];
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (step >= count - 1) return;
      timer = setTimeout(() => {
        step++;
        setDone(step);
        next();
      }, delays[Math.min(step, delays.length - 1)]);
    };
    next();
    return () => clearTimeout(timer);
  }, [count, finished]);
  return finished ? count : done;
}

/** A Stepper that runs by itself (see useSimulatedSteps). */
export function StepLoader({ steps, compact }: { steps: string[]; compact?: boolean }) {
  const done = useSimulatedSteps(steps.length);
  return <Stepper steps={steps} done={done} compact={compact} />;
}
