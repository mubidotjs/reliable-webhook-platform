import { Client, Receiver } from "@upstash/qstash";
import { z } from "zod";
import { parseQueueEnvironment } from "@rwp/config";
import type { DeliveryJob } from "./processor";

export const deliveryJobSchema = z
  .object({
    outboxId: z.string().min(1).max(128),
    deliveryId: z.string().min(1).max(128),
    generation: z.number().int().positive(),
  })
  .strict();
export interface DeliveryQueue {
  readonly kind: "local" | "qstash";
  publish(job: DeliveryJob, dueAt: Date): Promise<string>;
}
export class LocalQueue implements DeliveryQueue {
  readonly kind = "local";
  constructor(private readonly process: (job: DeliveryJob) => Promise<void>) {}
  async publish(job: DeliveryJob): Promise<string> {
    await this.process(job);
    return job.outboxId;
  }
}
export function qstashClient() {
  const config = parseQueueEnvironment(process.env);
  if (config.QUEUE_ADAPTER !== "qstash")
    throw new Error("QStash is not configured");
  return new Client({
    token: config.QSTASH_TOKEN,
    baseUrl: config.QSTASH_URL,
    retry: { retries: 0 },
    devMode: false,
  });
}
export class QStashQueue implements DeliveryQueue {
  readonly kind = "qstash";
  async publish(job: DeliveryJob, dueAt: Date): Promise<string> {
    const config = parseQueueEnvironment(process.env);
    if (config.QUEUE_ADAPTER !== "qstash")
      throw new Error("QStash is not configured");
    const publication = qstashClient().publishJSON({
      url: new URL("/api/internal/deliveries/process", config.APP_URL).href,
      body: job,
      retries: 0,
      notBefore: Math.ceil(dueAt.getTime() / 1000),
      timeout: 20,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        publication,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Publication timeout")),
            10_000,
          );
        }),
      ]);
      return response.messageId;
    } finally {
      clearTimeout(timer);
    }
  }
}
export async function verifyQueueRequest(
  request: Request,
  body: string,
  path: string,
): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;
  const config = parseQueueEnvironment(process.env);
  if (config.QUEUE_ADAPTER !== "qstash") return false;
  try {
    return await new Receiver({
      currentSigningKey: config.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: config.QSTASH_NEXT_SIGNING_KEY,
    }).verify({
      signature,
      body,
      url: new URL(path, config.APP_URL).href,
    });
  } catch {
    return false;
  }
}
