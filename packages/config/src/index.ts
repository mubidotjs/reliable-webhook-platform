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
