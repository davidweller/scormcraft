import { Prisma as PgPrisma, PrismaClient as PgPrismaClient } from "@prisma/client";

/**
 * One Prisma client, chosen by DATABASE_URL.
 *
 * The web app runs on Postgres (`@prisma/client`). The desktop app runs on a
 * local SQLite file (`file:` url) whose client is generated from the same
 * models into src/generated/prisma-sqlite (see scripts/make-sqlite-schema.ts).
 * The model API is identical, so the SQLite client is typed as the Postgres one.
 *
 * Runtime values such as `Prisma.JsonNull` are tied to the client that made
 * them, so use `JsonNull` from here. Importing `Prisma` from "@prisma/client"
 * is fine for types only.
 */

const IS_SQLITE = (process.env.DATABASE_URL ?? "").startsWith("file:");

function loadSqlite(): { PrismaClient: typeof PgPrismaClient; Prisma: typeof PgPrisma } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../generated/prisma-sqlite");
}

const active = IS_SQLITE ? loadSqlite() : { PrismaClient: PgPrismaClient, Prisma: PgPrisma };

/** `Prisma.JsonNull` from whichever client is active. */
export const JsonNull: typeof PgPrisma.JsonNull = active.Prisma.JsonNull;
export const isSqlite = IS_SQLITE;

const globalForPrisma = globalThis as unknown as { prisma: PgPrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new active.PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
