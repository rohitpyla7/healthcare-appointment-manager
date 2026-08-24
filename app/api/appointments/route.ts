import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generatePreVisitSummary } from "@/lib/llm";
import { error,ok } from "@/lib/http";
import { lockDoctorSlot } from "@/lib/slot-lock";
const schema=z.object({doctorId:z.string(),startTime:z.string().datetime(),reason:z.string().max(500).optional(),symptoms:z.string().min(5).max(5000)});
export async function POST(req:Request){
  try{
    const patient=await requireUser("PATIENT"); const d=schema.parse(await req.json()); const start=new Date(d.startTime); const doctor=await prisma.doctorProfile.findUnique({where:{id:d.doctorId},include:{user:true}}); if(!doctor)return error("Doctor not found",404);
    const hours=(doctor.workingHours as Record<string,{start:string;end:string}|null>)[["sun","mon","tue","wed","thu","fri","sat"][start.getDay()]]; if(!hours)return error("Doctor is not working that day",409);
    const pre=await generatePreVisitSummary(d.symptoms); const end=new Date(start.getTime()+doctor.slotDuration*60000); const holdExpiresAt=new Date(Date.now()+5*60000);
    const appointment=await prisma.$transaction(async tx=>{
      await lockDoctorSlot(tx, doctor.id, start);
      const leave=await tx.doctorLeave.findFirst({where:{doctorId:doctor.id,startDate:{lt:end},endDate:{gt:start}}}); if(leave)throw new Error("DOCTOR_ON_LEAVE");
      const conflicts=await tx.appointment.findMany({where:{doctorId:doctor.id,status:{in:["PENDING","CONFIRMED"]},startTime:{lt:end},endTime:{gt:start}}});
      const active=conflicts.some(a=>a.status==="CONFIRMED" || !a.holdExpiresAt || a.holdExpiresAt>new Date()); if(active)throw new Error("SLOT_UNAVAILABLE");
      const a=await tx.appointment.create({data:{patientId:patient.id,doctorId:doctor.id,startTime:start,endTime:end,status:"PENDING",holdExpiresAt,reason:d.reason}});
      await tx.symptomForm.create({data:{appointmentId:a.id,symptoms:d.symptoms}});
      await tx.preVisitSummary.create({data:{appointmentId:a.id,urgency:pre.urgency,chiefComplaint:pre.chiefComplaint,questions:pre.questions,rawOutput:pre.rawOutput}});
      return a;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return ok({appointmentId:appointment.id,status:appointment.status,holdExpiresAt:appointment.holdExpiresAt,preVisit:pre},201);
  }catch(e){const m=e instanceof Error?e.message:"";if(m==="SLOT_UNAVAILABLE")return error("That slot was just booked by another patient",409);if(m==="DOCTOR_ON_LEAVE")return error("Doctor is on leave for this date",409);if(m.includes("Unique constraint"))return error("That slot is no longer available",409);return error("Could not create appointment",400);}
}

export async function GET(){try{const u=await requireUser();const where=u.role==="PATIENT"?{patientId:u.id}:u.role==="DOCTOR"?{doctorId:u.doctor?.id}:{};const appointments=await prisma.appointment.findMany({where,include:{patient:{select:{name:true,email:true}},doctor:{include:{user:{select:{name:true,email:true}}}},preVisit:true,postVisit:{include:{summary:true}},symptoms:true,alternatives:{where:{status:"AVAILABLE"},orderBy:{rank:"asc"}}},orderBy:{startTime:"asc"}});return ok({appointments});}catch(e){return error(e instanceof Error&&e.message==="UNAUTHORIZED"?"Unauthorized":"Forbidden",401);}}
