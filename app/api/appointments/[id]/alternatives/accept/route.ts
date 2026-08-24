import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queueCalendar, queueNotification } from "@/lib/notifications";
import { error, ok } from "@/lib/http";
import { lockDoctorSlot } from "@/lib/slot-lock";

const schema = z.object({ alternativeId: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("PATIENT");
    const { id } = await params;
    const { alternativeId } = schema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id },
        include: { doctor: { include: { user: true } }, patient: true },
      });
      const alternative = await tx.appointmentAlternative.findUnique({ where: { id: alternativeId } });
      if (!appointment || appointment.patientId !== user.id || !alternative || alternative.appointmentId !== id) throw new Error("NOT_FOUND");
      if (appointment.status !== "CANCELLED" || alternative.status !== "AVAILABLE") throw new Error("INVALID_STATUS");
      if (alternative.suggestedStart <= new Date()) throw new Error("EXPIRED");
      await lockDoctorSlot(tx, appointment.doctorId, alternative.suggestedStart);

      const leave = await tx.doctorLeave.findFirst({
        where: { doctorId: appointment.doctorId, startDate: { lt: alternative.suggestedEnd }, endDate: { gt: alternative.suggestedStart } },
      });
      if (leave) throw new Error("LEAVE");

      const conflicts = await tx.appointment.findMany({
        where: { doctorId: appointment.doctorId, status: { in: ["PENDING", "CONFIRMED"] }, startTime: { lt: alternative.suggestedEnd }, endTime: { gt: alternative.suggestedStart } },
      });
      const activeConflict = conflicts.some((a) => a.status === "CONFIRMED" || !a.holdExpiresAt || a.holdExpiresAt > new Date());
      if (activeConflict) throw new Error("CONFLICT");

      const result = await tx.appointment.update({
        where: { id },
        data: { startTime: alternative.suggestedStart, endTime: alternative.suggestedEnd, status: "CONFIRMED", holdExpiresAt: null, cancelledByRole: null },
      });
      await tx.appointmentAlternative.update({ where: { id: alternativeId }, data: { status: "ACCEPTED" } });
      await tx.appointmentAlternative.updateMany({ where: { appointmentId: id, id: { not: alternativeId }, status: "AVAILABLE" }, data: { status: "EXPIRED" } });
      await tx.notification.createMany({ data: [
        { userId: appointment.patientId, appointmentId: id, type: "BOOKING_CONFIRMATION", subject: "Alternative appointment confirmed", body: `Your appointment with ${appointment.doctor.user.name} is now confirmed for ${alternative.suggestedStart.toLocaleString()}.` },
        { userId: appointment.doctor.userId, appointmentId: id, type: "BOOKING_CONFIRMATION", subject: "Appointment rescheduled", body: `${appointment.patient.name}'s appointment has been moved to ${alternative.suggestedStart.toLocaleString()}.` },
      ] });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await queueCalendar(user.id, id, "CREATE");
    const doctor = await prisma.doctorProfile.findUnique({ where: { id: updated.doctorId } });
    if (doctor) await queueCalendar(doctor.userId, id, "CREATE");
    return ok({ appointment: updated });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "NOT_FOUND") return error("Alternative appointment not found", 404);
    if (m === "CONFLICT") return error("That alternative slot was just booked. Please choose another.", 409);
    if (m === "LEAVE") return error("Doctor is unavailable for that alternative slot", 409);
    if (m === "EXPIRED") return error("That alternative slot has expired", 409);
    if (m === "INVALID_STATUS") return error("This appointment is no longer eligible for an alternative", 409);
    return error("Could not accept alternative appointment", 400);
  }
}
