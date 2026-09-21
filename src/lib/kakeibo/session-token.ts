/** Persist Better Auth session token for the live-preview bearer path. */
export function captureAuthToken(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const rec = data as Record<string, unknown>;
  const session = rec.session;
  const fromSession =
    session && typeof session === "object" && typeof (session as { token?: unknown }).token === "string"
      ? ((session as { token: string }).token)
      : null;
  const token = typeof rec.token === "string" ? rec.token : fromSession;
  if (!token) return;
  try {
    sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* ignore */
  }
}
