import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { error, ok } from "@/lib/http";

export async function GET() {
  try {
    await requireUser("ADMIN");
    const [notificationCounts, calendarCounts, failedNotifications, failedCalendar, pendingNotifications, pendingCalendar] = await Promise.all([
      prisma.notification.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.calendarEvent.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.notification.findMany({ where: { status: "FAILED" }, include: { user: { select: { name: true, email: true } } }, orderBy: { nextAttemptAt: "desc" }, take: 10 }),
      prisma.calendarEvent.findMany({ where: { status: "FAILED" }, include: { user: { select: { name: true, email: true } } }, orderBy: { nextAttemptAt: "desc" }, take: 10 }),
      prisma.notification.count({ where: { status: "PENDING" } }),
      prisma.calendarEvent.count({ where: { status: "PENDING" } }),
    ]);
    return ok({ notificationCounts, calendarCounts, failedNotifications, failedCalendar, pendingNotifications, pendingCalendar, generatedAt: new Date().toISOString() });
  } catch {
    return error("Could not load notification health", 400);
  }
}
