import type { ActionResult } from "@/server/actions/result";
import { nudgeAfterMutation } from "@/components/ui/render-nudge";

export const OFFLINE_MESSAGE = "Couldn't reach the server. Check the connection and try again — nothing you entered was lost.";

/**
 * Await a server action without letting a network failure escape. A thrown error
 * inside a transition would otherwise hit the page's error boundary and wipe the
 * form the user was filling in.
 */
export async function safeAction<T>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const res = await call();
    if (res.ok) nudgeAfterMutation(); // make sure the refreshed page is shown promptly
    return res;
  } catch (err) {
    console.error("[action] request failed", err);
    return { ok: false, error: OFFLINE_MESSAGE };
  }
}
