"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Works around a stall in the React build bundled with Next.js 15.5 (19.2 canary):
 * the page update returned by a server action is occasionally left uncommitted until
 * some *other* state update happens in the app (observed: the refreshed list appeared
 * only when an unrelated toast was dismissed, ~3.5 s later). Any root update makes
 * React retry that held work, so after each successful save we schedule a few cheap,
 * render-only updates. The provider's children are not re-rendered by this.
 *
 * The same stall hits client-side navigations that only change the query string
 * (filter chips, date presets, list rows linking to ?service=…): the new page is
 * fetched but not shown. So in-app link clicks and Back/Forward get the same nudge.
 */
let nudge: (() => void) | null = null;

export function nudgeAfterMutation() {
  nudge?.();
}

export function RenderNudgeProvider({ children }: { children: ReactNode }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    nudge = () => {
      for (const ms of [0, 80, 250, 600]) {
        const t = setTimeout(() => {
          timers.delete(t);
          setTick((n) => n + 1);
        }, ms);
        timers.add(t);
      }
    };
    // Capture phase so this runs before Next's <Link> handler; ignore new-tab/download clicks.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.getAttribute("target") === "_blank" || a.hasAttribute("download")) return;
      const url = new URL((a as HTMLAnchorElement).href, location.href);
      if (url.origin === location.origin) nudge?.();
    };
    const onPopState = () => nudge?.();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      nudge = null;
      timers.forEach(clearTimeout);
    };
  }, []);
  return <>{children}</>;
}
