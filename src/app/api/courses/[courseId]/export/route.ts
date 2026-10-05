import { NextResponse } from "next/server";
import { getCourseForExport } from "@/lib/course-export";
import { buildScorm12Zip } from "@/lib/scorm/build-package";
import { buildCourseDocx } from "@/lib/docx-export";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const {
      format = "scorm",
      includeAnswers = true,
      version = "1.2",
      completionRules,
      scoring,
      lmsSettings,
    } = body as {
      format?: "scorm" | "docx";
      includeAnswers?: boolean;
      version?: "1.2" | "2004";
      completionRules?: unknown;
      scoring?: unknown;
      lmsSettings?: unknown;
    };

    const course = await getCourseForExport(courseId);
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const safeTitle = course.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);

    if (format === "docx") {
      const docxBuffer = await buildCourseDocx(course, { includeAnswers: includeAnswers !== false });
      return new NextResponse(new Uint8Array(docxBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
          "Content-Length": String(docxBuffer.length),
        },
      });
    }

    const effectiveVersion = version === "2004" ? "2004" : "1.2";
    if (effectiveVersion !== "1.2") {
      return NextResponse.json(
        { error: "SCORM 2004 export not implemented yet. Use 1.2." },
        { status: 400 }
      );
    }

    const zipBuffer = await buildScorm12Zip(course as Parameters<typeof buildScorm12Zip>[0]);
    const filename = `scorm-${safeTitle}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
