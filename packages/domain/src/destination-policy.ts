import { isIP } from "node:net";

import ipaddr from "ipaddr.js";

export const allowedDestinationPorts = [443] as const;

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type DestinationResolver = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

export class DestinationPolicyError extends Error {
  constructor(
    public readonly reason:
      | "INVALID_URL"
      | "HTTPS_REQUIRED"
      | "CREDENTIALS_FORBIDDEN"
      | "FRAGMENT_FORBIDDEN"
      | "PORT_FORBIDDEN"
      | "ADDRESS_FORBIDDEN"
      | "NO_ADDRESSES",
  ) {
    super(reason);
    this.name = "DestinationPolicyError";
  }
}

function withoutIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function assertPublicAddress(address: string): void {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    throw new DestinationPolicyError("ADDRESS_FORBIDDEN");
  }

  if (parsed.kind() === "ipv6") {
    const ipv6 = parsed as ipaddr.IPv6;
    if (ipv6.isIPv4MappedAddress()) {
      parsed = ipv6.toIPv4Address();
    }
  }

  if (parsed.range() !== "unicast") {
    throw new DestinationPolicyError("ADDRESS_FORBIDDEN");
  }
}

export function validateDestinationUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DestinationPolicyError("INVALID_URL");
  }

  if (url.protocol !== "https:") {
    throw new DestinationPolicyError("HTTPS_REQUIRED");
  }
  if (url.username || url.password) {
    throw new DestinationPolicyError("CREDENTIALS_FORBIDDEN");
  }
  if (url.hash) {
    throw new DestinationPolicyError("FRAGMENT_FORBIDDEN");
  }
  if (url.port && !allowedDestinationPorts.includes(Number(url.port) as 443)) {
    throw new DestinationPolicyError("PORT_FORBIDDEN");
  }

  const hostname = withoutIpv6Brackets(url.hostname);
  if (!hostname) {
    throw new DestinationPolicyError("INVALID_URL");
  }
  if (isIP(hostname)) {
    assertPublicAddress(hostname);
  }

  url.hash = "";
  return url;
}

export async function resolveAndValidateDestination(
  rawUrl: string,
  resolver: DestinationResolver,
): Promise<{ url: URL; addresses: readonly ResolvedAddress[] }> {
  const url = validateDestinationUrl(rawUrl);
  const hostname = withoutIpv6Brackets(url.hostname);
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await resolver(hostname);

  if (addresses.length === 0) {
    throw new DestinationPolicyError("NO_ADDRESSES");
  }
  for (const answer of addresses) {
    if (
      (answer.family !== 4 && answer.family !== 6) ||
      isIP(answer.address) !== answer.family
    ) {
      throw new DestinationPolicyError("ADDRESS_FORBIDDEN");
    }
    assertPublicAddress(answer.address);
  }

  return { url, addresses };
}
