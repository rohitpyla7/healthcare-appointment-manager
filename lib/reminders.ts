import { prisma } from "@/lib/prisma";

export type ReminderTier = "STANDARD" | "CONFIRMATION_REQUIRED";

/**
 * Reminder behavior is based only on appointment logistics and attendance history.
 * It never uses symptoms, diagnoses, prescriptions, or other clinical information.
 */
export async function calculateReminderTier(patientId: string): Promise<ReminderTier> {
  const history = await prisma.appointment.findMany({
    where: { patientId, status: "CANCELLED", cancelledByRole: "PATIENT", startTime: { lt: new Date() } },
    orderBy: { startTime: "desc" },
    take: 5,
    select: { status: true },
  });
  if (history.length >= 2) return "CONFIRMATION_REQUIRED";
  return "STANDARD";
}

export function reminderPlan(tier: ReminderTier) {
  return tier === "CONFIRMATION_REQUIRED"
    ? ["24h email reminder", "2h email reminder with confirmation request"]
    : ["24h email reminder"];
}
