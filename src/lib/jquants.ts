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
  if (typeof close !== "number" || !Number.isFinite(close)) return null;
  const rounded = Math.round(close);
  if (rounded <= 0) return null;

  return {
    date: latest.Date,
    close: rounded,
    adjusted: typeof latest.AdjC === "number",
  };
}

export function isJQuantsConfigured(apiKey: string | undefined) {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}
