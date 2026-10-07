/**
 * Delete the leavings of abandoned SCORM imports.
 *
 * /analyze uploads the package and ingests its assets for real, because the
 * review step has to report which assets failed and re-ingesting at commit
 * would upload everything twice. The cost of that choice is that an import the
 * user never commits leaves behind:
 *
 *   - imports/scorm/<token>/package.zip  and  staged.json
 *   - media/scorm-*.<ext> blobs, each with a Media row
 *
 * A committed import deletes its own package and staged draft; its media is
 * referenced by the course and must be kept. This script handles the rest.
 *
 *   npx tsx scripts/gc-scorm-imports.ts            # report only
 *   npx tsx scripts/gc-scorm-imports.ts --delete   # actually delete
 */

import { prisma } from "../src/lib/db";
import { deleteBlob, isBlobConfigured, listBlobs } from "../src/lib/blob";
import { STAGING_PREFIX, STAGING_TTL_MS } from "../src/lib/scorm/import/staging";

const DELETE = process.argv.includes("--delete");

/** Media rows this old with no block referencing them are from dead imports. */
const ORPHAN_MEDIA_MIN_AGE_MS = STAGING_TTL_MS;

async function sweepStagingBlobs(): Promise<number> {
  const cutoff = Date.now() - STAGING_TTL_MS;
  const blobs = await listBlobs(`${STAGING_PREFIX}/`);
  const stale = blobs.filter((b) => b.uploadedAt.getTime() < cutoff);

  console.log(
    `staging blobs: ${blobs.length} total, ${stale.length} older than ${(
      STAGING_TTL_MS / 3600_000
    ).toFixed(0)}h`
  );
  for (const blob of stale) {
    console.log(`  ${DELETE ? "deleting" : "would delete"} ${blob.pathname}`);
    if (DELETE) await deleteBlob(blob.url).catch((e) => console.warn(`    failed: ${e}`));
  }
  return stale.length;
}

/**
 * Media rows from a SCORM import that no block references.
 *
 * Checked against Block.data as text rather than a join: Media has no relation
 * to Block, and a url can appear in several block types' data under different
 * keys (image.url, video_embed.url, file_download.url).
 */
async function sweepOrphanMedia(): Promise<number> {
  const cutoff = new Date(Date.now() - ORPHAN_MEDIA_MIN_AGE_MS);
  const candidates = await prisma.media.findMany({
    where: { filename: { startsWith: "scorm-" }, createdAt: { lt: cutoff } },
    select: { id: true, url: true, filename: true },
  });

  if (candidates.length === 0) {
    console.log("orphan media: no candidates");
    return 0;
  }

  const referenced = new Set<string>();
  // Paged rather than loaded whole: Block.data can be large.
  const pageSize = 500;
  for (let skip = 0; ; skip += pageSize) {
    const blocks = await prisma.block.findMany({
      skip,
      take: pageSize,
      select: { data: true },
    });
    if (blocks.length === 0) break;
    const haystack = JSON.stringify(blocks.map((b) => b.data));
    for (const media of candidates) {
      if (!referenced.has(media.id) && haystack.includes(media.url)) referenced.add(media.id);
    }
  }

  const orphans = candidates.filter((m) => !referenced.has(m.id));
  console.log(
    `orphan media: ${candidates.length} import candidates, ${orphans.length} unreferenced`
  );
  for (const media of orphans) {
    console.log(`  ${DELETE ? "deleting" : "would delete"} ${media.filename}`);
    if (DELETE) {
      await deleteBlob(media.url).catch((e) => console.warn(`    blob failed: ${e}`));
      await prisma.media.delete({ where: { id: media.id } }).catch((e) =>
        console.warn(`    row failed: ${e}`)
      );
    }
  }
  return orphans.length;
}

async function main(): Promise<void> {
  if (!isBlobConfigured()) {
    console.error("BLOB_READ_WRITE_TOKEN is not set; nothing to sweep.");
    process.exit(1);
  }
  if (!DELETE) console.log("Dry run. Pass --delete to remove anything.\n");

  const staleBlobs = await sweepStagingBlobs();
  const orphanMedia = await sweepOrphanMedia();

  console.log(
    `\n${DELETE ? "Deleted" : "Would delete"} ${staleBlobs} staging blob(s) and ${orphanMedia} media item(s).`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
