import { Prisma as PgPrisma, PrismaClient as PgPrismaClient } from "@prisma/client";
import { join } from "node:path";

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

/**
 * Loaded from disk at runtime, never bundled: webpack's file tracer can't
 * follow the generated client and the build fails if it tries. The standalone
 * build copies the folder in via outputFileTracingIncludes (next.config.mjs),
 * and the server's cwd is the project (dev) or standalone root (packaged).
 */
function loadSqlite(): { PrismaClient: typeof PgPrismaClient; Prisma: typeof PgPrisma } {
  const dir =
    process.env.PRISMA_SQLITE_CLIENT_DIR || join(process.cwd(), "src", "generated", "prisma-sqlite");
  const nodeRequire = eval("require") as NodeRequire;
  return nodeRequire(dir);
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
