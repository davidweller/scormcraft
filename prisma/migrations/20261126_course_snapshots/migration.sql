-- CreateTable
CREATE TABLE "CourseSnapshot" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseSnapshot_courseId_createdAt_idx" ON "CourseSnapshot"("courseId", "createdAt");

-- AddForeignKey
ALTER TABLE "CourseSnapshot" ADD CONSTRAINT "CourseSnapshot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
