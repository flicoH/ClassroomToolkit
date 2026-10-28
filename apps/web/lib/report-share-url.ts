/** Localhost addresses refer to the phone itself; LAN-opened teacher apps should share their own origin. */
export function localReportShareUrl(value: string, currentOrigin: string) {
  try {
    const url = new URL(value);
    const current = new URL(currentOrigin);
    const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (
      !local.has(url.hostname) ||
      local.has(current.hostname) ||
      !url.pathname.startsWith("/r/") ||
      !["http:", "https:"].includes(current.protocol)
    )
      return value;
    return new URL(`${url.pathname}${url.search}${url.hash}`, current.origin).toString();
  } catch {
    return value;
  }
}
