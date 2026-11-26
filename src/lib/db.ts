import { Prisma, PrismaClient } from "@prisma/client";

/**
 * The app's one Prisma client, on a local SQLite file. electron/env.js sets
 * DATABASE_URL to a `file:` url in the data folder.
 */

/** `Prisma.JsonNull`, re-exported so callers need only a type import of `Prisma`. */
export const JsonNull: typeof Prisma.JsonNull = Prisma.JsonNull;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
