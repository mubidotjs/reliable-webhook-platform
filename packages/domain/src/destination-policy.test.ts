import { describe, expect, it } from "vitest";

import {
  DestinationPolicyError,
  assertPublicAddress,
  resolveAndValidateDestination,
  validateDestinationUrl,
} from "./destination-policy";

describe("destination policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "ff00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("rejects non-public address %s", (address) => {
    expect(() => assertPublicAddress(address)).toThrow(DestinationPolicyError);
  });

  it.each(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])(
    "accepts public unicast address %s",
    (address) => expect(() => assertPublicAddress(address)).not.toThrow(),
  );

  it.each([
    "http://example.com/hook",
    "https://user:pass@example.com/hook",
    "https://example.com:8443/hook",
    "https://example.com/hook#fragment",
    "not a url",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => validateDestinationUrl(url)).toThrow(DestinationPolicyError);
  });

  it("normalizes safe URLs while preserving path and query", () => {
    expect(
      validateDestinationUrl(
        "https://EXAMPLE.com:443/hooks/a?token=x",
      ).toString(),
    ).toBe("https://example.com/hooks/a?token=x");
  });

  it("rejects a DNS response when any answer is unsafe", async () => {
    await expect(
      resolveAndValidateDestination("https://example.com/hook", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ reason: "ADDRESS_FORBIDDEN" });
  });

  it("rejects empty DNS responses", async () => {
    await expect(
      resolveAndValidateDestination("https://example.com/hook", async () => []),
    ).rejects.toMatchObject({ reason: "NO_ADDRESSES" });
  });

  it("rejects resolver answers with a mismatched address family", async () => {
    await expect(
      resolveAndValidateDestination("https://example.com/hook", async () => [
        { address: "93.184.216.34", family: 6 },
      ]),
    ).rejects.toMatchObject({ reason: "ADDRESS_FORBIDDEN" });
  });
});
