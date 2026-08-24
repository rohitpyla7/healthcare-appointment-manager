import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE = "healthcare_session";
const secret = () => process.env.JWT_SECRET || "dev-only-secret-change-me";
type Session = { userId: string; role: Role };
export function signSession(session: Session) { return jwt.sign(session, secret(), { expiresIn: "7d" }); }
export function verifySession(token: string): Session | null { try { return jwt.verify(token, secret()) as Session; } catch { return null; } }
export async function setSession(session: Session) { (await cookies()).set(COOKIE, signSession(session), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 604800 }); }
export async function clearSession() { (await cookies()).delete(COOKIE); }
export async function getSession() { const token = (await cookies()).get(COOKIE)?.value; return token ? verifySession(token) : null; }
export async function requireUser(role?: Role) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (role && session.role !== role) throw new Error("FORBIDDEN");
  const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { doctor: true } });
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
