import { Prisma } from "@prisma/client";

/**
 * PostgreSQL transaction-scoped advisory lock for one doctor's slot.
 * The lock disappears automatically when the surrounding transaction ends.
 */
export async function lockDoctorSlot(tx: Prisma.TransactionClient, doctorId: string, startTime: Date) {
  const key = `${doctorId}|${startTime.toISOString()}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
