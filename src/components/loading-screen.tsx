"use client";

import { GetmedsLogo } from "./icons";
import { Stepper, useSimulatedSteps } from "./stepper";
import { ProgressHold } from "./top-progress";

/**
 * The loading page a section shows while its data loads (its loading.tsx). It fills the page area
 * only: the sidebar and top bar stay as they are. `fullPage` centres it on the whole screen, for
 * the first load before the frame itself is ready.
 */
export function LoadingScreen({ title, steps, fullPage = false }: { title: string; steps: string[]; fullPage?: boolean }) {
  const done = useSimulatedSteps(steps.length);
  const current = steps[Math.min(done, steps.length - 1)];

  return (
    <div
      className={`flex w-full items-center justify-center bg-[var(--canvas)] px-4 py-10 ${fullPage ? "min-h-screen" : "min-h-[calc(100vh-3.5rem)]"}`}
      aria-busy="true"
    >
      <ProgressHold />
      <div className="flex w-full max-w-md animate-dialog-in flex-col items-center gap-6 rounded-3xl border border-[var(--rule)] bg-[var(--canvas)] px-6 py-9 text-center shadow-[0_12px_40px_rgba(0,0,0,0.07)] sm:px-10">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--tint)]">
          <span className="absolute inset-0 animate-ping rounded-2xl bg-[var(--tint-2)] opacity-60 [animation-duration:1.6s]" />
          <GetmedsLogo className="relative h-9 w-9" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-lg font-semibold text-[var(--ink)]">{title}</h2>
          <p className="m-0 text-sm text-[var(--ink-3)]" aria-live="polite">
            {current}…
          </p>
        </div>
        <Stepper steps={steps} done={done} />
      </div>
    </div>
  );
}
