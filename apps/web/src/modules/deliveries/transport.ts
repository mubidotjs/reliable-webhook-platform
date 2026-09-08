import https from "node:https";
import { performance } from "node:perf_hooks";
import {
  DestinationPolicyError,
  validateDestinationUrl,
  type SendResult,
} from "@rwp/domain";
import { createSafeConnectionLookup } from "@/modules/endpoints/destination-resolver";

export type OutboundRequest = {
  url: string;
  body: string;
  headers: Record<string, string>;
};
export type Transport = (input: OutboundRequest) => Promise<SendResult>;

export const sendWebhook: Transport = async (input) => {
  const started = performance.now();
  try {
    validateDestinationUrl(input.url);
  } catch {
    return {
      httpStatus: null,
      errorClass: "DESTINATION_POLICY",
      durationMs: 0,
    };
  }
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: Omit<SendResult, "durationMs">) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      resolve({
        ...result,
        durationMs: Math.max(0, Math.round(performance.now() - started)),
      });
    };
    const request = https.request(
      input.url,
      {
        method: "POST",
        agent: false,
        lookup: createSafeConnectionLookup(),
        headers: {
          ...input.headers,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(input.body),
        },
      },
      (response) => {
        // Status headers are sufficient; never buffer untrusted response bodies.
        finish({
          httpStatus: response.statusCode ?? null,
          errorClass: null,
          retryAfter: response.headers["retry-after"]?.slice(0, 128),
        });
        response.destroy();
      },
    );
    const deadline = setTimeout(() => {
      finish({ httpStatus: null, errorClass: "TIMEOUT" });
      request.destroy();
    }, 5000);
    request.on("error", (error: NodeJS.ErrnoException) =>
      finish({
        httpStatus: null,
        errorClass:
          error.code === "EACCES" ||
          error.cause instanceof DestinationPolicyError
            ? "DESTINATION_POLICY"
            : "NETWORK",
      }),
    );
    request.end(input.body);
  });
};
