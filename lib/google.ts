import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export function oauthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}
export function getAuthUrl(state: string) {
  return oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["https://www.googleapis.com/auth/calendar.events"], state });
}
async function getCalendarClient(userId: string) {
  const account = await prisma.googleAccount.findUnique({ where: { userId } }); if (!account) throw new Error("GOOGLE_NOT_CONNECTED");
  const auth = oauthClient(); auth.setCredentials({ access_token: account.accessToken, refresh_token: account.refreshToken, expiry_date: account.expiryDate?.getTime() });
  auth.on("tokens", async tokens => { if (tokens.access_token) await prisma.googleAccount.update({ where: { userId }, data: { accessToken: tokens.access_token, expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : account.expiryDate } }); });
  return google.calendar({ version: "v3", auth });
}
export async function createCalendarEvent(userId: string, title: string, start: Date, end: Date, description: string) {
  const calendar = await getCalendarClient(userId);
  const result = await calendar.events.insert({ calendarId: "primary", requestBody: { summary: title, description, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } } });
  return result.data.id;
}
export async function updateCalendarEvent(userId: string, eventId: string, title: string, start: Date, end: Date, description: string) {
  const calendar = await getCalendarClient(userId);
  await calendar.events.update({ calendarId: "primary", eventId, requestBody: { summary: title, description, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } } });
}
export async function deleteCalendarEvent(userId: string, eventId: string) {
  const calendar = await getCalendarClient(userId); await calendar.events.delete({ calendarId: "primary", eventId });
}
