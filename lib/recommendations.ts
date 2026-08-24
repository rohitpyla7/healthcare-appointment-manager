import { prisma } from "@/lib/prisma";
import { generateSlots } from "@/lib/slots";

export type RecommendedSlot = {
  doctorId: string;
  doctorName: string;
  specialisation: string;
  start: string;
  end: string;
  score: number;
  reasons: string[];
};

function timeMinutes(value: Date) {
  return value.getHours() * 60 + value.getMinutes();
}

function preferenceMinutes(preference: "morning" | "afternoon" | "evening" | "any") {
  if (preference === "morning") return 10 * 60;
  if (preference === "afternoon") return 14 * 60;
  if (preference === "evening") return 18 * 60;
  return 12 * 60;
}

export async function recommendSlots(options: {
  doctorId?: string;
  specialisation?: string;
  from: Date;
  days?: number;
  preference?: "morning" | "afternoon" | "evening" | "any";
  limit?: number;
}) {
  const days = Math.min(Math.max(options.days ?? 7, 1), 14);
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const preference = options.preference ?? "any";

  const doctors = await prisma.doctorProfile.findMany({
    where: {
      ...(options.doctorId ? { id: options.doctorId } : {}),
      ...(options.specialisation
        ? { specialisation: { contains: options.specialisation, mode: "insensitive" } }
        : {}),
    },
    include: { user: { select: { name: true } } },
  });

  const now = new Date();
  const results: RecommendedSlot[] = [];

  for (const doctor of doctors) {
    for (let offset = 0; offset < days; offset++) {
      const date = new Date(options.from);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      const slots = await generateSlots(doctor, date);

      for (const slot of slots) {
        if (!slot.available || slot.start <= now) continue;
        const minutes = timeMinutes(slot.start);
        const distance = Math.abs(minutes - preferenceMinutes(preference));
        let score = 100 - Math.min(distance / 8, 30) - offset * 3;
        const reasons: string[] = [];

        if (preference !== "any") {
          const inPreferredWindow =
            (preference === "morning" && minutes >= 6 * 60 && minutes < 12 * 60) ||
            (preference === "afternoon" && minutes >= 12 * 60 && minutes < 17 * 60) ||
            (preference === "evening" && minutes >= 17 * 60 && minutes < 22 * 60);
          if (inPreferredWindow) {
            score += 15;
            reasons.push(`Matches your ${preference} preference`);
          }
        }
        if (offset === 0) reasons.push("Earliest available day");
        reasons.push("No scheduling conflict");

        results.push({
          doctorId: doctor.id,
          doctorName: doctor.user.name,
          specialisation: doctor.specialisation,
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          score: Math.round(score),
          reasons,
        });
      }
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))
    .slice(0, limit);
}

export async function findAlternativeSlots(doctorId: string, from: Date, durationMinutes: number, limit = 3) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { user: { select: { name: true } } },
  });
  if (!doctor) return [];

  const candidates: { start: Date; end: Date; score: number }[] = [];
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < 14; offset++) {
    const date = new Date(base);
    date.setDate(date.getDate() + offset);
    const slots = await generateSlots(doctor, date);
    for (const slot of slots) {
      if (!slot.available || slot.start <= new Date()) continue;
      const timeDistance = Math.abs(timeMinutes(slot.start) - timeMinutes(from));
      const score = 100 - offset * 4 - timeDistance / 10;
      candidates.push({ start: slot.start, end: new Date(slot.start.getTime() + durationMinutes * 60000), score });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.start.getTime() - b.start.getTime())
    .slice(0, limit);
}
