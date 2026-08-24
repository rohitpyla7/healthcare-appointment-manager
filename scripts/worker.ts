import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { createCalendarEvent,deleteCalendarEvent,updateCalendarEvent } from "@/lib/google";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms)); const retryAt=(a:number)=>new Date(Date.now()+Math.min(60,2**a)*60_000);
async function expireHolds(){await prisma.appointment.updateMany({where:{status:"PENDING",holdExpiresAt:{lt:new Date()}},data:{status:"CANCELLED",holdExpiresAt:null}})}
async function processNotifications(){const jobs=await prisma.notification.findMany({where:{status:{in:["PENDING","FAILED"]},nextAttemptAt:{lte:new Date()}},include:{user:true},take:50});for(const n of jobs){try{await sendEmail(n.user.email,n.subject,n.body);await prisma.notification.update({where:{id:n.id},data:{status:"SENT",sentAt:new Date(),attempts:{increment:1}}})}catch(e){const a=n.attempts+1;await prisma.notification.update({where:{id:n.id},data:{status:a>=5?"FAILED":"PENDING",attempts:a,lastError:e instanceof Error?e.message:"Unknown error",nextAttemptAt:retryAt(a)}})}}}
async function processCalendar(){const jobs=await prisma.calendarEvent.findMany({where:{status:{in:["PENDING","FAILED"]},nextAttemptAt:{lte:new Date()}},include:{appointment:{include:{doctor:{include:{user:true}}}}},take:50});for(const ce of jobs){try{if(ce.operation==="CREATE"){if(ce.googleEventId){await prisma.calendarEvent.update({where:{id:ce.id},data:{status:"CREATED",attempts:{increment:1}}});continue}const gid=await createCalendarEvent(ce.userId,`Appointment with ${ce.appointment.doctor.user.name}`,ce.appointment.startTime,ce.appointment.endTime,`Healthcare appointment. ID: ${ce.appointmentId}`);await prisma.calendarEvent.update({where:{id:ce.id},data:{status:"CREATED",googleEventId:gid,attempts:{increment:1}}})}else if(ce.operation==="UPDATE"){if(ce.googleEventId)await updateCalendarEvent(ce.userId,ce.googleEventId,`Appointment with ${ce.appointment.doctor.user.name}`,ce.appointment.startTime,ce.appointment.endTime,`Healthcare appointment. ID: ${ce.appointmentId}`);await prisma.calendarEvent.update({where:{id:ce.id},data:{status:"UPDATED",attempts:{increment:1}}})}else{if(ce.googleEventId)await deleteCalendarEvent(ce.userId,ce.googleEventId);await prisma.calendarEvent.update({where:{id:ce.id},data:{status:"DELETED",attempts:{increment:1}}})}}catch(e){const a=ce.attempts+1;await prisma.calendarEvent.update({where:{id:ce.id},data:{status:a>=5?"FAILED":"PENDING",attempts:a,lastError:e instanceof Error?e.message:"Unknown error",nextAttemptAt:retryAt(a)}})}}}

async function processAppointmentReminders(){
  const now=new Date();
  const horizon=new Date(now.getTime()+24*60*60*1000);
  const appointments=await prisma.appointment.findMany({
    where:{status:"CONFIRMED",startTime:{gt:now,lte:horizon}},
    include:{patient:true,doctor:{include:{user:true}}},
    take:100
  });
  for(const a of appointments){
    const hoursUntil=(a.startTime.getTime()-now.getTime())/3600000;
    if(hoursUntil<=24 && !a.reminder24SentAt){
      const claimed=await prisma.appointment.updateMany({where:{id:a.id,status:"CONFIRMED",reminder24SentAt:null},data:{reminder24SentAt:now}});
      if(claimed.count){
        await prisma.notification.create({data:{userId:a.patientId,appointmentId:a.id,type:"REMINDER",subject:"Appointment reminder",body:`Reminder: your appointment with ${a.doctor.user.name} is on ${a.startTime.toLocaleString()}. ${a.reminderTier==="CONFIRMATION_REQUIRED"?"Please confirm that you can attend.":"We look forward to seeing you."}`}});
        await prisma.notification.create({data:{userId:a.doctor.userId,appointmentId:a.id,type:"REMINDER",subject:"Upcoming appointment reminder",body:`Reminder: ${a.patient.name} is scheduled for ${a.startTime.toLocaleString()}.`}});
      }
    }
    if(a.reminderTier==="CONFIRMATION_REQUIRED" && hoursUntil<=2 && !a.reminder2SentAt){
      const claimed=await prisma.appointment.updateMany({where:{id:a.id,status:"CONFIRMED",reminder2SentAt:null},data:{reminder2SentAt:now}});
      if(claimed.count){
        await prisma.notification.create({data:{userId:a.patientId,appointmentId:a.id,type:"REMINDER",subject:"Appointment starts soon",body:`Your appointment with ${a.doctor.user.name} starts at ${a.startTime.toLocaleString()}. Please make sure you can attend.`}});
      }
    }
  }
}

async function processMedication(){const jobs=await prisma.medicationReminder.findMany({where:{active:true,nextRunAt:{lte:new Date()}},take:50});for(const m of jobs){await prisma.notification.create({data:{userId:(await prisma.appointment.findUniqueOrThrow({where:{id:m.appointmentId}})).patientId,appointmentId:m.appointmentId,type:"MEDICATION",subject:`Medication reminder: ${m.medication}`,body:`Reminder to take ${m.medication}. Frequency: ${m.frequency}.`}});const match=m.frequency.match(/(\d+)/);const times=match?Math.max(1,Number(match[1])):1;await prisma.medicationReminder.update({where:{id:m.id},data:{lastSentAt:new Date(),nextRunAt:new Date(Date.now()+Math.floor(24/times)*3600000)}})}}
async function tick(){await expireHolds();await processAppointmentReminders();await processNotifications();await processCalendar();await processMedication()}
async function main() {
  console.log("CareFlow worker started");

  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error(e);
    }

    await sleep(60000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
