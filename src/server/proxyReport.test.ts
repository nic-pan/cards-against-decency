import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { isPrivateAddress, proxyReport } from "./proxyReport";

const req = (headers: Record<string, string>, remoteAddress: string) =>
  ({ headers, socket: { remoteAddress } }) as unknown as IncomingMessage;

describe("proxyReport", () => {
  it("counts entries and never returns an address", () => {
    const report = proxyReport(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }, "10.1.2.3"));
    expect(report.forwardedForEntries).toBe(2);
    expect(report.directConnectionIsPrivate).toBe(true);
    expect(report.proxyHeadersPresent).toEqual(["x-forwarded-for"]);
    const text = JSON.stringify(report);
    expect(text).not.toContain("203.0.113.7");
    expect(text).not.toContain("6.6.6.6");
    expect(text).not.toContain("10.1.2.3");
  });

  it("recognises private addresses", () => {
    expect(isPrivateAddress("::ffff:192.168.1.5")).toBe(true);
    expect(isPrivateAddress("172.20.0.1")).toBe(true);
    expect(isPrivateAddress("203.0.113.7")).toBe(false);
  });
});
