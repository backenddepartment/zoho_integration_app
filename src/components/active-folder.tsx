"use client";

import { useEffect, useSyncExternalStore } from "react";

// Which top folder the current page is inside, for the sidebar's tree highlight. The sidebar sits
// in the shared layout, which doesn't know the page's folder, so the page reports it here.

let activeId: string | undefined;
const listeners = new Set<() => void>();

function set(id: string | undefined) {
  activeId = id;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** Put on a page to keep `id`'s entry in the sidebar highlighted while it's showing. */
export function ActiveFolder({ id }: { id: string | undefined }) {
  useEffect(() => {
    set(id);
    return () => set(undefined);
  }, [id]);
  return null;
}

export function useActiveFolder() {
  return useSyncExternalStore(subscribe, () => activeId, () => undefined);
}
