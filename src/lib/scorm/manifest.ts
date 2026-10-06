/**
 * Build SCORM 1.2 imsmanifest.xml (minimal).
 */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface PageEntry {
  id: string;
  identifier: string;
  title: string;
  href: string;
}

export function buildManifest12(options: {
  courseId: string;
  courseTitle: string;
  pages: PageEntry[];
  additionalFiles?: string[];
  /**
   * Path of the round-trip sidecar, declared as an `asset` resource that no
   * <item> references. An LMS that prunes unreferenced files would otherwise
   * strip it, and anything in the organization tree would be launchable.
   */
  sidecarPath?: string;
}): string {
  const { courseId, courseTitle, pages, additionalFiles = [], sidecarPath } = options;
  const safeId = courseId.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^([^a-zA-Z])/, "c_$1");
  const extraFiles = additionalFiles
    .map((f) => `      <file href="${escapeXml(f)}" />`)
    .join("\n");
  const items = pages
    .map(
      (p, i) =>
        `    <item identifier="item_${i}" identifierref="res_${i}"><title>${escapeXml(p.title)}</title></item>`
    )
    .join("\n");
  const resources = pages
    .map(
      (p) =>
        `    <resource identifier="res_${p.identifier}" type="webcontent" adlcp:scormtype="sco" href="${escapeXml(p.href)}">\n      <file href="${escapeXml(p.href)}" />${extraFiles ? `\n${extraFiles}` : ""}\n    </resource>`
    )
    .join("\n");
  const sidecarResource = sidecarPath
    ? `\n    <resource identifier="res_scormcraft_sidecar" type="webcontent" adlcp:scormtype="asset">\n      <file href="${escapeXml(sidecarPath)}" />\n    </resource>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(safeId)}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${escapeXml(safeId)}">
    <organization identifier="${escapeXml(safeId)}">
      <title>${escapeXml(courseTitle)}</title>
${items}
    </organization>
  </organizations>
  <resources>
${resources}${sidecarResource}
  </resources>
</manifest>
`;
}
