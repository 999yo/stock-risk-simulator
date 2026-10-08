const TWELVE_WEEKS_MS = 84 * 24 * 60 * 60 * 1000;

export type JQuantsDailyBar = {
  Date?: string;
  Code?: string;
  C?: number | null;
  AdjC?: number | null;
};

export function getDelayedWindow(now = new Date()) {
  const to = new Date(now.getTime() - TWELVE_WEEKS_MS);
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function selectLatestDelayedClose(bars: JQuantsDailyBar[]) {
  const latest = bars
    .filter(
      (bar): bar is JQuantsDailyBar & { Date: string } =>
        typeof bar.Date === "string" &&
        (typeof bar.AdjC === "number" || typeof bar.C === "number"),
    )
    .sort((a, b) => b.Date.localeCompare(a.Date))[0];

  if (!latest) return null;
  const close = typeof latest.AdjC === "number" ? latest.AdjC : latest.C;
  if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) return null;

  return {
    date: latest.Date,
    close,
    adjusted: typeof latest.AdjC === "number",
  };
}

export function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
