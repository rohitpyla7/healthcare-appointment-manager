import { DoctorProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export type WorkingDay = { start: string; end: string };
function parseTime(date: Date, hhmm: string) { const [h, m] = hhmm.split(":").map(Number); const d = new Date(date); d.setHours(h, m, 0, 0); return d; }
export async function isOnLeave(doctorId: string, date: Date) { const start = new Date(date); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(end.getDate()+1); return !!(await prisma.doctorLeave.findFirst({ where: { doctorId, startDate: { lt: end }, endDate: { gt: start } } })); }
export async function generateSlots(doctor: DoctorProfile, date: Date) {
  if (await isOnLeave(doctor.id, date)) return [];
  const weekdays = ["sun","mon","tue","wed","thu","fri","sat"]; const hours = (doctor.workingHours as Record<string, WorkingDay | null>)[weekdays[date.getDay()]]; if (!hours) return [];
  const dayStart = parseTime(date, hours.start), dayEnd = parseTime(date, hours.end);
  const appointments = await prisma.appointment.findMany({ where: { doctorId: doctor.id, startTime: { gte: dayStart, lt: dayEnd }, status: { in: ["PENDING","CONFIRMED"] } }, select: { startTime:true,endTime:true,status:true,holdExpiresAt:true } });
  const now = new Date(); const slots: {start:Date;end:Date;available:boolean}[]=[];
  for (let cursor = new Date(dayStart); cursor < dayEnd; cursor = new Date(cursor.getTime()+doctor.slotDuration*60000)) { const end = new Date(cursor.getTime()+doctor.slotDuration*60000); if(end>dayEnd) break; const blocked=appointments.some(a => (a.status!=="PENDING" || !a.holdExpiresAt || a.holdExpiresAt>now) && a.startTime<end && a.endTime>cursor); slots.push({start:cursor,end,available:!blocked}); }
  return slots;
}
