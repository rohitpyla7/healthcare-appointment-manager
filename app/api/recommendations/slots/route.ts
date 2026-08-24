import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { error, ok } from "@/lib/http";
import { recommendSlots } from "@/lib/recommendations";

const querySchema = z.object({
  doctorId: z.string().optional(),
  specialisation: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preference: z.enum(["morning", "afternoon", "evening", "any"]).default("any"),
  days: z.coerce.number().int().min(1).max(14).default(7),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export async function GET(req: Request) {
  try {
    await requireUser("PATIENT");
    const url = new URL(req.url);
    const parsed = querySchema.parse(Object.fromEntries(url.searchParams));
    const from = new Date(`${parsed.date}T00:00:00`);
    if (Number.isNaN(from.getTime())) return error("Invalid date", 400);
    const recommendations = await recommendSlots({ ...parsed, from });
    return ok({ recommendations });
  } catch (e) {
    return error(e instanceof z.ZodError ? "Invalid recommendation request" : "Could not generate recommendations", 400);
  }
}
