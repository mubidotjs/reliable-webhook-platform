import { randomBytes, randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { serializeSignedCookie } from "better-call";

import { PrismaClient } from "../src/generated/prisma/client";

const databaseURL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54329/reliable_webhooks?schema=public";
const authSecret =
  process.env.BETTER_AUTH_SECRET ??
  "development-only-secret-change-before-deploying";

async function createAuthenticatedOwner(database: PrismaClient, label: string) {
  const userId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  await database.user.create({
    data: {
      id: userId,
      name: `${label} Owner`,
      email: `${userId}@example.test`,
      workspace: { create: { name: `${label} Workspace` } },
      sessions: {
        create: {
          id: randomUUID(),
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        },
      },
    },
  });
  const serialized = await serializeSignedCookie(
    "better-auth.session_token",
    token,
    authSecret,
    { httpOnly: true, sameSite: "lax", path: "/" },
  );
  const cookieHeader = serialized.split(";", 1)[0];
  if (!cookieHeader) {
    throw new Error("Failed to create the Better Auth test cookie.");
  }
  return { cookieHeader, userId };
}

export default async function globalSetup() {
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL }),
  });
  const primary = await createAuthenticatedOwner(database, "M1 Primary");
  const outsider = await createAuthenticatedOwner(database, "M1 Outsider");
  process.env.E2E_PRIMARY_COOKIE = primary.cookieHeader;
  process.env.E2E_OUTSIDER_COOKIE = outsider.cookieHeader;

  return async () => {
    await database.user.deleteMany({
      where: { id: { in: [primary.userId, outsider.userId] } },
    });
    await database.$disconnect();
  };
}
