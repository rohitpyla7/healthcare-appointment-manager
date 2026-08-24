import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { error, ok } from "@/lib/http";

export async function GET() {
  try {
    await requireUser("ADMIN");
    const [upcoming, completed, cancelled] = await Promise.all([
      prisma.appointment.count({ where: { status: "CONFIRMED", startTime: { gte: new Date() } } }),
      prisma.appointment.count({ where: { status: "COMPLETED" } }),
      prisma.appointment.count({ where: { status: "CANCELLED" } }),
    ]);
    const totalPast = completed + cancelled;
    const attendanceRate = totalPast ? Math.round((completed / totalPast) * 100) : null;
    return ok({ upcoming, completed, cancelled, attendanceRate });
  } catch {
    return error("Could not load attendance data", 400);
  }
}
