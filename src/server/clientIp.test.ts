import { describe, expect, it } from "vitest";
import { clientIp, trustedHopsFromEnv } from "./clientIp";

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

  it("reads TRUST_PROXY safely", () => {
    expect(trustedHopsFromEnv(undefined)).toBe(0);
    expect(trustedHopsFromEnv("1")).toBe(1);
    expect(trustedHopsFromEnv("yes")).toBe(0);
    expect(trustedHopsFromEnv("99")).toBe(0);
  });
});
