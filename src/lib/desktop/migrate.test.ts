import { describe, expect, it } from "vitest";
import { splitSql } from "./migrate";

describe("splitSql", () => {
  it("drops comments and splits on statement ends", () => {
    const sql = `-- CreateTable
CREATE TABLE "A" (
    "id" TEXT NOT NULL PRIMARY KEY
);

-- CreateIndex
CREATE INDEX "A_id_idx" ON "A"("id");
`;
    expect(splitSql(sql)).toEqual([
      'CREATE TABLE "A" (\n    "id" TEXT NOT NULL PRIMARY KEY\n)',
      'CREATE INDEX "A_id_idx" ON "A"("id")',
    ]);
  });

  it("keeps semicolons inside a line", () => {
    expect(splitSql("INSERT INTO t VALUES ('a;b');\n")).toEqual(["INSERT INTO t VALUES ('a;b')"]);
  });
});
