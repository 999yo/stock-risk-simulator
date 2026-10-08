import { describe, expect, it } from "vitest";
import { getDelayedWindow, isLocalHostname, selectLatestDelayedClose } from "./jquants";

describe("J-Quants delayed price helpers", () => {
  it("caps the request window at twelve weeks before today", () => {
    expect(getDelayedWindow(new Date("2026-10-08T12:00:00Z"))).toEqual({
      from: "2026-06-16",
      to: "2026-07-16",
    });
  });

  it("selects the newest available adjusted close", () => {
    expect(
      selectLatestDelayedClose([
        { Date: "2026-07-14", C: 2480, AdjC: 1240 },
        { Date: "2026-07-16", C: 2520, AdjC: 1260 },
        { Date: "2026-07-15", C: 2500, AdjC: 1250 },
      ]),
    ).toEqual({ date: "2026-07-16", close: 1260, adjusted: true });
  });

  it("falls back to unadjusted close and ignores missing prices", () => {
    expect(
      selectLatestDelayedClose([
        { Date: "2026-07-16", C: null, AdjC: null },
        { Date: "2026-07-15", C: 2500 },
      ]),
    ).toEqual({ date: "2026-07-15", close: 2500, adjusted: false });
  });

  it("allows only loopback hostnames for the private integration", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("portfolio.example.com")).toBe(false);
  });
});
