import { describe, expect, it } from "vitest";
import { clientIp, clientIpFrom, ipHeaderFromEnv, trustedHopsFromEnv } from "./clientIp";

describe("clientIp", () => {
  it("uses the socket address without a trusted proxy", () => {
    expect(clientIp("1.2.3.4", "10.0.0.1", 0)).toBe("10.0.0.1");
  });

  it("takes the address that the trusted proxy added, not a spoofed one", () => {
    // The browser sent "6.6.6.6"; the proxy appended the real address "1.2.3.4".
    expect(clientIp("6.6.6.6, 1.2.3.4", "10.0.0.1", 1)).toBe("1.2.3.4");
    expect(clientIp("1.2.3.4", "10.0.0.1", 1)).toBe("1.2.3.4");
  });

  it("counts several trusted proxies from the right", () => {
    expect(clientIp("6.6.6.6, 1.2.3.4, 172.16.0.9", "10.0.0.1", 2)).toBe("1.2.3.4");
  });

  it("falls back to the socket address when the header is missing or short", () => {
    expect(clientIp(undefined, "10.0.0.1", 1)).toBe("10.0.0.1");
    expect(clientIp("1.2.3.4", "10.0.0.1", 3)).toBe("10.0.0.1");
  });

  it("prefers the protected edge header when it is configured", () => {
    const headers = { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.2, 10.0.0.3" };
    expect(clientIpFrom(headers, "10.0.0.9", { trustedHops: 3, header: "cf-connecting-ip" })).toBe("203.0.113.7");
    // Without the header, the hop count gives the same address.
    expect(clientIpFrom({ "x-forwarded-for": headers["x-forwarded-for"] }, "10.0.0.9", { trustedHops: 3, header: "cf-connecting-ip" })).toBe("203.0.113.7");
    // A value that is not an address is ignored.
    expect(clientIpFrom({ "cf-connecting-ip": "<script>" }, "10.0.0.9", { trustedHops: 0, header: "cf-connecting-ip" })).toBe("10.0.0.9");
  });

  it("accepts only known header names", () => {
    expect(ipHeaderFromEnv("CF-Connecting-IP")).toBe("cf-connecting-ip");
    expect(ipHeaderFromEnv("x-forwarded-for")).toBeUndefined();
    expect(ipHeaderFromEnv(undefined)).toBeUndefined();
  });

  it("reads TRUST_PROXY safely", () => {
    expect(trustedHopsFromEnv(undefined)).toBe(0);
    expect(trustedHopsFromEnv("1")).toBe(1);
    expect(trustedHopsFromEnv("yes")).toBe(0);
    expect(trustedHopsFromEnv("99")).toBe(0);
  });
});
