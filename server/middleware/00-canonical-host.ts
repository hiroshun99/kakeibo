/**
 * 家計簿 is "kakeibo". The alias ieikeibo.vercel.app was a misreading
 * (家 as "ie") and should never be the address in the browser.
 * Permanent redirect keeps old bookmarks working.
 */
const CANONICAL_HOST = "kakeibo-home.vercel.app";
const LEGACY_HOSTS = new Set(["ieikeibo.vercel.app"]);

interface HostEvent {
  url: URL;
  req: { method?: string; headers: Headers };
}

function requestHost(event: HostEvent): string {
  const raw =
    event.req.headers.get("x-forwarded-host") ??
    event.req.headers.get("host") ??
    event.url.host;
  return raw.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";
}

export default function canonicalHost(
  event: HostEvent,
  next: () => unknown | Promise<unknown>,
): unknown | Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();
  if (!LEGACY_HOSTS.has(requestHost(event))) return next();
  const target = new URL(event.url.pathname + event.url.search, `https://${CANONICAL_HOST}`);
  return new Response(null, {
    status: 308,
    headers: {
      location: target.toString(),
      "cache-control": "public, max-age=3600",
    },
  });
}
