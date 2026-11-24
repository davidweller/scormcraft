import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { JsonNull, prisma } from "@/lib/db";

function dbErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "");
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: string }).code;
    if (code === "P1001" || code === "P1002") return "Database unreachable. Set DATABASE_URL in .env and ensure the database is running.";
    if (code === "P2021") return "Database tables missing. Run: npx prisma db push";
    if (code === "P1003") return "Database not found. Check DATABASE_URL.";
  }
  // Surface the real error so user can fix it (e.g. "relation \"Course\" does not exist")
  if (msg && process.env.NODE_ENV !== "production") return msg;
  if (msg && /relation.*does not exist|table.*doesn't exist/i.test(msg)) return "Database tables missing. Run: npx prisma db push";
  return msg || "Failed to create course. Run: npx prisma db push";
}

export async function GET() {
  try {
    const courses = await prisma.course.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, overview: true, updatedAt: true },
    });
    return NextResponse.json(courses);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      title,
      overview,
      audience,
      targetWordCount,
      tone,
      complianceLevel,
      brandConfig,
      settings,
    } = body as {
      title: string;
      overview?: string;
      audience?: string;
      targetWordCount?: number;
      tone?: string;
      complianceLevel?: string;
      brandConfig?: unknown;
      settings?: unknown;
    };
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const course = await prisma.course.create({
      data: {
        title: title.trim(),
        overview: overview?.trim() ?? null,
        audience: audience?.trim() ?? null,
        targetWordCount: typeof targetWordCount === "number" ? targetWordCount : null,
        tone: tone?.trim() ?? null,
        complianceLevel: complianceLevel?.trim() ?? null,
        brandConfig: brandConfig != null ? (brandConfig as Prisma.InputJsonValue) : JsonNull,
        settings: settings != null ? (settings as Prisma.InputJsonValue) : JsonNull,
      },
    });
    return NextResponse.json(course);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 500 });
  }
}
