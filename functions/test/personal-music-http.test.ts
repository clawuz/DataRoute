import { describe, expect, it } from "vitest";
import { clientIp, visitorId } from "../src/personal-music-http.js";

describe("client address", () => {
  it("trusts only the last X-Forwarded-For entry (the edge appends the real address)", () => {
    expect(clientIp("9.9.9.9,212.252.32.226")).toBe("212.252.32.226");
    expect(clientIp("212.252.32.226")).toBe("212.252.32.226");
    expect(clientIp("1.1.1.1, 2.2.2.2 , 3.3.3.3")).toBe("3.3.3.3");
  });
  it("falls back without the header", () => {
    expect(clientIp(undefined, "10.0.0.1")).toBe("10.0.0.1");
    expect(clientIp("", "10.0.0.1")).toBe("10.0.0.1");
  });
  it("hashes the address with the day, without storing it", () => {
    const a = visitorId("1.2.3.4", "2026-10-14");
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(a).not.toContain("1.2.3.4");
    expect(visitorId("1.2.3.4", "2026-10-15")).not.toBe(a);
  });
});
