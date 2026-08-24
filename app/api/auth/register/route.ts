import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { setSession } from "@/lib/auth";
import { error, ok } from "@/lib/http";
const schema=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),phone:z.string().optional()});
export async function POST(req:Request){try{const d=schema.parse(await req.json());const email=d.email.toLowerCase();if(await prisma.user.findUnique({where:{email}}))return error("Email already registered",409);const u=await prisma.user.create({data:{name:d.name,email,passwordHash:hashPassword(d.password),phone:d.phone,role:"PATIENT"}});await setSession({userId:u.id,role:u.role});return ok({user:{id:u.id,name:u.name,email:u.email,role:u.role}},201);}catch(e){return error(e instanceof z.ZodError?e.issues[0]?.message||"Invalid input":"Registration failed");}}
