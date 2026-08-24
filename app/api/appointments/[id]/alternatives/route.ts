import { requireUser } from "@/lib/auth";
import { error, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("PATIENT");
    const { id } = await params;
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { alternatives: { where: { status: "AVAILABLE" }, orderBy: { rank: "asc" } }, doctor: { include: { user: { select: { name: true } } } } },
    });
    if (!appointment || appointment.patientId !== user.id) return error("Appointment not found", 404);
    return ok({ alternatives: appointment.alternatives, doctor: appointment.doctor.user.name });
  } catch {
    return error("Could not load alternatives", 400);
  }
}
