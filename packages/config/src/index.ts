import { z } from "zod";

const queueAdapterSchema = z.enum(["local", "qstash"]);

export const serverEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  QUEUE_ADAPTER: queueAdapterSchema.default("local"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  source: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(source);
}

export type EncryptionKeyringConfig = {
  activeVersion: string;
  keys: ReadonlyMap<string, Buffer>;
};

export function parseEncryptionKeyring(
  source: Record<string, string | undefined>,
): EncryptionKeyringConfig {
  const activeVersion = z
    .string()
    .regex(/^[A-Za-z0-9_]{1,32}$/)
    .parse(source.ENCRYPTION_KEY_VERSION)
    .toLowerCase();
  const keys = new Map<string, Buffer>();

  for (const [name, value] of Object.entries(source)) {
    const match = /^ENCRYPTION_KEY_([A-Z0-9_]+)$/.exec(name);
    if (!match || name === "ENCRYPTION_KEY_VERSION" || !value) {
      continue;
    }
    const version = match[1]?.toLowerCase();
    if (!version || !/^[a-z0-9_]{1,32}$/.test(version)) {
      continue;
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
      throw new Error(`${name} must be a canonical 32-byte base64url key.`);
    }
    const decoded = Buffer.from(value, "base64url");
    if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
      throw new Error(`${name} must be a canonical 32-byte base64url key.`);
    }
    keys.set(version, decoded);
  }

  if (!keys.has(activeVersion)) {
    throw new Error(
      `Missing encryption key for active version ${activeVersion}.`,
    );
  }

  return { activeVersion, keys };
}

const qstashEnvironmentSchema = z.object({
  QUEUE_ADAPTER: z.literal("qstash"),
  QSTASH_URL: z.string().url().default("https://qstash.upstash.io"),
  QSTASH_TOKEN: z.string().min(1),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
  APP_URL: z
    .string()
    .url()
    .refine(
      (value) => new URL(value).protocol === "https:",
      "Hosted callbacks require HTTPS",
    ),
});
export function parseQueueEnvironment(
  source: Record<string, string | undefined>,
) {
  if ((source.QUEUE_ADAPTER ?? "local") === "local")
    return { QUEUE_ADAPTER: "local" as const };
  return qstashEnvironmentSchema.parse(source);
}

const positiveLimit = (fallback: number, maximum = 1_000_000) =>
  z.coerce.number().int().min(1).max(maximum).default(fallback);

export const hardeningEnvironmentSchema = z.object({
  EVENT_BODY_LIMIT_BYTES: positiveLimit(262144, 1048576),
  DAILY_TENANT_DELIVERY_LIMIT: positiveLimit(25),
  DAILY_GLOBAL_DELIVERY_LIMIT: positiveLimit(100),
  DAILY_PUBLICATION_LIMIT: positiveLimit(650),
  MUTATION_REQUESTS_PER_MINUTE: positiveLimit(120, 10000),
});
export function parseHardeningEnvironment(
  source: Record<string, string | undefined>,
) {
  return hardeningEnvironmentSchema.parse(source);
}

// Configuration diagnostics name invalid fields, never their supplied values.
export function validateRuntimeEnvironment(
  source: Record<string, string | undefined>,
) {
  try {
    const server = parseServerEnvironment(source);
    const queue = parseQueueEnvironment(source);
    const keyring = parseEncryptionKeyring(source);
    const limits = parseHardeningEnvironment(source);
    if (source.VERCEL_ENV === "production") {
      if (queue.QUEUE_ADAPTER !== "qstash")
        throw new Error("QUEUE_ADAPTER must be qstash for hosted production.");
      for (const name of ["BETTER_AUTH_URL", "APP_URL", "QSTASH_URL"]) {
        const value = name === "QSTASH_URL" ? queue.QSTASH_URL : source[name];
        const url = new URL(value ?? "");
        if (
          url.protocol !== "https:" ||
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ) {
          throw new Error(name + " requires a public HTTPS origin.");
        }
      }
    }
    return { server, queue, keyring, limits };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        "Invalid configuration fields: " +
          [...new Set(error.issues.map((issue) => issue.path.join(".")))].join(
            ", ",
          ),
      );
    }
    // Keyring errors are deliberately constructed from variable names only.
    if (
      error instanceof Error &&
      /^(Missing encryption key|ENCRYPTION_KEY_|QUEUE_ADAPTER|BETTER_AUTH_URL requires|APP_URL requires|QSTASH_URL requires)/.test(
        error.message,
      )
    )
      throw error;
    throw new Error("Invalid runtime configuration.");
  }
}
