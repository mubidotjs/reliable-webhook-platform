import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

import {
  DestinationPolicyError,
  assertPublicAddress,
  type DestinationResolver,
} from "@rwp/domain";

export const systemDestinationResolver: DestinationResolver = async (
  hostname,
) => {
  const answers = await lookup(hostname, { all: true, order: "verbatim" });
  return answers.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
};

function connectionError(cause: unknown): NodeJS.ErrnoException {
  const error = new Error("Destination address rejected by policy.", {
    cause,
  }) as NodeJS.ErrnoException;
  error.code = cause instanceof DestinationPolicyError ? "EACCES" : "ENOTFOUND";
  return error;
}

export function createSafeConnectionLookup(
  resolver: DestinationResolver = systemDestinationResolver,
): LookupFunction {
  return (hostname, options, callback) => {
    void resolver(hostname)
      .then((answers) => {
        if (answers.length === 0) {
          throw new DestinationPolicyError("NO_ADDRESSES");
        }
        for (const answer of answers) {
          if (isIP(answer.address) !== answer.family) {
            throw new DestinationPolicyError("ADDRESS_FORBIDDEN");
          }
          assertPublicAddress(answer.address);
        }
        const family = options.family ?? 0;
        const eligible = family
          ? answers.filter((answer) => answer.family === family)
          : answers;
        if (eligible.length === 0) {
          throw new DestinationPolicyError("NO_ADDRESSES");
        }
        if (options.all) {
          callback(null, [...eligible]);
          return;
        }
        const selected = eligible[0];
        if (!selected) {
          throw new DestinationPolicyError("NO_ADDRESSES");
        }
        callback(null, selected.address, selected.family);
      })
      .catch((error: unknown) => callback(connectionError(error), "", 0));
  };
}
