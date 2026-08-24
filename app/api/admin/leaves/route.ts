import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { error, ok } from "@/lib/http";
import { findAlternativeSlots } from "@/lib/recommendations";

const schema = z.object({
  doctorId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    await requireUser("ADMIN");
    const d = schema.parse(await req.json());
    const start = new Date(d.startDate);
    const end = new Date(d.endDate);
    if (end <= start) return error("End date must be after start date");

    const doctor = await prisma.doctorProfile.findUnique({ where: { id: d.doctorId }, include: { user: true } });
    if (!doctor) return error("Doctor not found", 404);

    const leave = await prisma.doctorLeave.create({ data: { doctorId: d.doctorId, startDate: start, endDate: end, reason: d.reason } });
    const affected = await prisma.appointment.findMany({
      where: { doctorId: d.doctorId, status: { in: ["PENDING", "CONFIRMED"] }, startTime: { lt: end }, endTime: { gt: start } },
      include: { patient: true },
    });

    const results = [] as { appointmentId: string; alternatives: number }[];
    for (const a of affected) {
      await prisma.appointment.update({ where: { id: a.id }, data: { status: "CANCELLED", holdExpiresAt: null, cancelledByRole: "ADMIN" } });
      await prisma.notification.create({
        data: {
          userId: a.patientId,
          appointmentId: a.id,
          type: "LEAVE_CHANGE",
          subject: "Appointment affected by doctor leave",
          body: `Your appointment with ${doctor.user.name} on ${a.startTime.toLocaleString()} was cancelled because the doctor is unavailable. We found alternative slots for you in the patient portal.`,
        },
      });
      await prisma.notification.create({
        data: {
          userId: doctor.userId,
          appointmentId: a.id,
          type: "LEAVE_CHANGE",
          subject: "Appointment affected by leave",
          body: `The appointment with ${a.patient.name} was cancelled because of your leave.`,
        },
      });

      const calendarEvents = await prisma.calendarEvent.findMany({ where: { appointmentId: a.id, status: { not: "DELETED" } } });
      for (const ce of calendarEvents) {
        await prisma.calendarEvent.create({ data: { userId: ce.userId, appointmentId: a.id, operation: "DELETE", googleEventId: ce.googleEventId } });
      }

      const alternatives = await findAlternativeSlots(a.doctorId, end, Math.round((a.endTime.getTime() - a.startTime.getTime()) / 60000), 3);
      for (let i = 0; i < alternatives.length; i++) {
        await prisma.appointmentAlternative.create({
          data: { appointmentId: a.id, suggestedStart: alternatives[i].start, suggestedEnd: alternatives[i].end, rank: i + 1 },
        });
      }
      results.push({ appointmentId: a.id, alternatives: alternatives.length });
    }

    return ok({ leave, affectedAppointments: results }, 201);
  } catch (e) {
    return error(e instanceof z.ZodError ? "Invalid leave data" : "Could not create leave", 400);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireUser("ADMIN");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return error("id is required");
    await prisma.doctorLeave.delete({ where: { id } });
    return ok({ success: true });
  } catch {
    return error("Could not delete leave", 400);
  }
}
