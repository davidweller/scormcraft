import { CourseShell } from "@/components/course/CourseSidebar";

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <CourseShell courseId={courseId}>{children}</CourseShell>;
}
