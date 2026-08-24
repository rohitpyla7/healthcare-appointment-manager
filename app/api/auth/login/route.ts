import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { setSession } from "@/lib/auth";
import { error, ok } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const d = schema.parse(await req.json());

    const u = await prisma.user.findUnique({
      where: { email: d.email.toLowerCase() },
    });

    if (!u || !verifyPassword(d.password, u.passwordHash)) {
      return error("Invalid email or password", 401);
    }

    await setSession({
      userId: u.id,
      role: u.role,
    });

    return ok({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      },
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return error("Invalid request");
  }
}