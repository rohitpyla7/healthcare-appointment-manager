import { prisma } from "@/lib/prisma";

export async function queueNotification(userId: string, appointmentId: string | null, type: "BOOKING_CONFIRMATION" | "REMINDER" | "CANCELLATION" | "LEAVE_CHANGE" | "MEDICATION", subject: string, body: string) {
  return prisma.notification.create({ data: { userId, appointmentId, type, subject, body } });
}

export async function queueCalendar(userId: string, appointmentId: string, operation: "CREATE" | "UPDATE" | "DELETE") {
  return prisma.calendarEvent.create({ data: { userId, appointmentId, operation } });
}
