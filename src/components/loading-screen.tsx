import { AutoStepper } from "./stepper";
import { ProgressHold } from "./top-progress";

/**
 * The loading page a section shows while its data loads (its loading.tsx). It fills the page area
 * only: the sidebar and top bar stay as they are. Just the stepper on the page; the title is for
 * screen readers.
 */
export function LoadingScreen({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={title}
      className="flex min-h-[calc(100vh-3.5rem)] w-full items-center justify-center bg-[var(--canvas)] px-4 py-10"
    >
      <ProgressHold />
      <div className="animate-dialog-in">
        <AutoStepper steps={steps} />
      </div>
    </div>
  );
}

/**
 * The first load, before the signed-in frame is ready: a plain white page with the loader where
 * the page area will be, right of the sidebar's space (see app-shell-client.tsx), so it doesn't
 * jump when the frame comes in. No sidebar is drawn; the real one appears with the page.
 */
export function FrameLoadingScreen({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="flex min-h-screen w-full bg-[var(--canvas)] md:pl-64">
      <div className="flex min-w-0 flex-1 flex-col pt-14">
        <LoadingScreen title={title} steps={steps} />
      </div>
    </div>
  );
}
