/**
 * A random key identifying one save attempt (used for idempotent Complete Sale).
 * Uses crypto.getRandomValues, which — unlike crypto.randomUUID — also works when the
 * app is opened over plain http on the local network (e.g. a phone hitting a laptop).
 */
export function newRequestKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
