import {
  parseEncryptionKeyring,
  type EncryptionKeyringConfig,
} from "@rwp/config";
import type {
  CreateEndpointInput,
  EndpointResource,
  UpdateEndpointInput,
} from "@rwp/contracts";
import {
  DestinationPolicyError,
  createSigningSecret,
  resolveAndValidateDestination,
  type DestinationResolver,
} from "@rwp/domain";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { systemDestinationResolver } from "@/modules/endpoints/destination-resolver";
import { encryptEndpointSecret } from "@/modules/endpoints/secret-crypto";

const activeEndpointLimit = 5;
const transactionAttempts = 8;

type ActorContext = {
  workspaceId: string;
  userId: string;
};

type EndpointRow = {
  id: string;
  url: string;
  status: "ENABLED" | "DISABLED";
  timeoutMs: number;
  currentSecretVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

type CursorPayload = { v: 1; createdAt: string; id: string };

function endpointResource(endpoint: EndpointRow): EndpointResource {
  return {
    id: endpoint.id,
    url: endpoint.url,
    status: endpoint.status,
    timeoutMs: endpoint.timeoutMs,
    secretVersion: endpoint.currentSecretVersion,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

function encodeCursor(endpoint: EndpointRow): string {
  const payload: CursorPayload = {
    v: 1,
    createdAt: endpoint.createdAt.toISOString(),
    id: endpoint.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(value: string): { createdAt: Date; id: string } {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CursorPayload>;
    const createdAt = new Date(decoded.createdAt ?? "");
    if (
      decoded.v !== 1 ||
      typeof decoded.id !== "string" ||
      decoded.id.length === 0 ||
      decoded.id.length > 64 ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new Error("invalid cursor");
    }
    return { createdAt, id: decoded.id };
  } catch {
    throw new ApiError(
      400,
      "INVALID_CURSOR",
      "Invalid cursor",
      "The pagination cursor is invalid or expired.",
    );
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034") ||
    (error instanceof Error && error.message === "TransactionWriteConflict")
  );
}

export class EndpointService {
  constructor(
    private readonly database: PrismaClient,
    private readonly resolver: DestinationResolver,
    private readonly keyring: EncryptionKeyringConfig,
  ) {}

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= transactionAttempts; attempt += 1) {
      try {
        return await this.database.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt === transactionAttempts ||
          !isRetryableTransactionError(error)
        ) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 5 + Math.floor(Math.random() * 10)),
        );
      }
    }
    throw new Error("Unreachable transaction retry state.");
  }

  private async normalizeDestination(rawUrl: string): Promise<string> {
    try {
      const result = await resolveAndValidateDestination(rawUrl, this.resolver);
      return result.url.toString();
    } catch (error) {
      if (error instanceof DestinationPolicyError) {
        throw new ApiError(
          422,
          "DESTINATION_URL_REJECTED",
          "Destination rejected",
          "The destination URL does not satisfy the HTTPS and public-network policy.",
        );
      }
      throw new ApiError(
        503,
        "DESTINATION_DNS_FAILED",
        "Destination resolution failed",
        "The destination hostname could not be resolved safely.",
      );
    }
  }

  async create(
    actor: ActorContext,
    input: CreateEndpointInput,
  ): Promise<{ data: EndpointResource; signingSecret: string }> {
    const url = await this.normalizeDestination(input.url);
    const secret = createSigningSecret();
    const endpoint = await this.serializable(async (transaction) => {
      const enabledCount = await transaction.webhookEndpoint.count({
        where: { workspaceId: actor.workspaceId, status: "ENABLED" },
      });
      if (enabledCount >= activeEndpointLimit) {
        throw new ApiError(
          409,
          "ENDPOINT_LIMIT_REACHED",
          "Endpoint limit reached",
          "Disable an endpoint before creating another one.",
        );
      }
      const created = await transaction.webhookEndpoint.create({
        data: {
          workspaceId: actor.workspaceId,
          url,
          timeoutMs: input.timeoutMs,
        },
      });
      const encrypted = encryptEndpointSecret(
        secret.bytes,
        {
          workspaceId: actor.workspaceId,
          endpointId: created.id,
          secretVersion: 1,
        },
        this.keyring,
      );
      await transaction.endpointSecret.create({
        data: { endpointId: created.id, version: 1, ...encrypted },
      });
      await transaction.auditEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorId: actor.userId,
          action: "endpoint.created",
          targetType: "webhook_endpoint",
          targetId: created.id,
          metadata: { timeoutMs: input.timeoutMs, secretVersion: 1 },
        },
      });
      return created;
    });
    return {
      data: endpointResource(endpoint),
      signingSecret: secret.displayValue,
    };
  }

  async list(
    actor: ActorContext,
    input: { cursor?: string; limit: number },
  ): Promise<{
    data: EndpointResource[];
    page: { limit: number; nextCursor: string | null };
  }> {
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    const rows = await this.database.webhookEndpoint.findMany({
      where: {
        workspaceId: actor.workspaceId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    const hasNext = rows.length > input.limit;
    const selected = hasNext ? rows.slice(0, input.limit) : rows;
    const last = selected.at(-1);
    return {
      data: selected.map(endpointResource),
      page: {
        limit: input.limit,
        nextCursor: hasNext && last ? encodeCursor(last) : null,
      },
    };
  }

  async read(
    actor: ActorContext,
    endpointId: string,
  ): Promise<EndpointResource> {
    const endpoint = await this.database.webhookEndpoint.findFirst({
      where: { id: endpointId, workspaceId: actor.workspaceId },
    });
    if (!endpoint) {
      throw this.notFound();
    }
    return endpointResource(endpoint);
  }

  async update(
    actor: ActorContext,
    endpointId: string,
    input: UpdateEndpointInput,
  ): Promise<EndpointResource> {
    const existing = await this.database.webhookEndpoint.findFirst({
      where: { id: endpointId, workspaceId: actor.workspaceId },
    });
    if (!existing) {
      throw this.notFound();
    }
    const disabling = "status" in input;
    if (!disabling && existing.status === "DISABLED") {
      throw this.disabled();
    }
    if (disabling && existing.status === "DISABLED") {
      return endpointResource(existing);
    }
    const normalizedUrl =
      !disabling && input.url
        ? await this.normalizeDestination(input.url)
        : undefined;

    const updated = await this.serializable(async (transaction) => {
      const current = await transaction.webhookEndpoint.findFirst({
        where: { id: endpointId, workspaceId: actor.workspaceId },
      });
      if (!current) {
        throw this.notFound();
      }
      if (current.status === "DISABLED") {
        if (disabling) {
          return current;
        }
        throw this.disabled();
      }
      const changedFields = disabling
        ? ["status"]
        : [
            ...(normalizedUrl ? ["url"] : []),
            ...(input.timeoutMs !== undefined ? ["timeoutMs"] : []),
          ];
      const result = await transaction.webhookEndpoint.update({
        where: { id: endpointId },
        data: disabling
          ? { status: "DISABLED" }
          : {
              ...(normalizedUrl ? { url: normalizedUrl } : {}),
              ...(input.timeoutMs !== undefined
                ? { timeoutMs: input.timeoutMs }
                : {}),
            },
      });
      await transaction.auditEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorId: actor.userId,
          action: disabling ? "endpoint.disabled" : "endpoint.updated",
          targetType: "webhook_endpoint",
          targetId: endpointId,
          metadata: { changedFields },
        },
      });
      return result;
    });
    return endpointResource(updated);
  }

  async rotateSecret(
    actor: ActorContext,
    endpointId: string,
  ): Promise<{
    endpointId: string;
    secretVersion: number;
    signingSecret: string;
    createdAt: string;
  }> {
    const secret = createSigningSecret();
    const rotated = await this.serializable(async (transaction) => {
      const endpoint = await transaction.webhookEndpoint.findFirst({
        where: { id: endpointId, workspaceId: actor.workspaceId },
      });
      if (!endpoint) {
        throw this.notFound();
      }
      if (endpoint.status === "DISABLED") {
        throw this.disabled();
      }
      const nextVersion = endpoint.currentSecretVersion + 1;
      const encrypted = encryptEndpointSecret(
        secret.bytes,
        {
          workspaceId: actor.workspaceId,
          endpointId,
          secretVersion: nextVersion,
        },
        this.keyring,
      );
      const retired = await transaction.endpointSecret.updateMany({
        where: {
          endpointId,
          version: endpoint.currentSecretVersion,
          retiredAt: null,
        },
        data: { retiredAt: new Date() },
      });
      if (retired.count !== 1) {
        throw new Error("Endpoint secret state is inconsistent.");
      }
      const created = await transaction.endpointSecret.create({
        data: { endpointId, version: nextVersion, ...encrypted },
      });
      await transaction.webhookEndpoint.update({
        where: { id: endpointId },
        data: { currentSecretVersion: nextVersion },
      });
      await transaction.auditEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorId: actor.userId,
          action: "endpoint.secret_rotated",
          targetType: "webhook_endpoint",
          targetId: endpointId,
          metadata: {
            previousSecretVersion: endpoint.currentSecretVersion,
            secretVersion: nextVersion,
          },
        },
      });
      return { version: nextVersion, createdAt: created.createdAt };
    });
    return {
      endpointId,
      secretVersion: rotated.version,
      signingSecret: secret.displayValue,
      createdAt: rotated.createdAt.toISOString(),
    };
  }

  private notFound(): ApiError {
    return new ApiError(
      404,
      "ENDPOINT_NOT_FOUND",
      "Endpoint not found",
      "The endpoint does not exist in the authenticated workspace.",
    );
  }

  private disabled(): ApiError {
    return new ApiError(
      409,
      "ENDPOINT_DISABLED",
      "Endpoint disabled",
      "Disabled endpoints cannot be edited or rotate secrets.",
    );
  }
}

export function createEndpointService(options?: {
  database?: PrismaClient;
  resolver?: DestinationResolver;
  keyring?: EncryptionKeyringConfig;
}): EndpointService {
  return new EndpointService(
    options?.database ?? db,
    options?.resolver ?? systemDestinationResolver,
    options?.keyring ?? parseEncryptionKeyring(process.env),
  );
}
