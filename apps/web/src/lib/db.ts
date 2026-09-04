import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const fallbackDatabaseUrl =
  "postgresql://invalid:invalid@127.0.0.1:5432/invalid?schema=public";

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be configured in production.");
  }
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? fallbackDatabaseUrl,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
