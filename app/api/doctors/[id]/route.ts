import { prisma } from "@/lib/prisma"; import { error,ok } from "@/lib/http";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const d=await prisma.doctorProfile.findUnique({where:{id},include:{user:{select:{id:true,name:true}},leaves:true}});if(!d)return error("Doctor not found",404);return ok({doctor:d});}
