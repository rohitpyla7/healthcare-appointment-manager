import { getSession,signSession } from "@/lib/auth"; import { getAuthUrl } from "@/lib/google"; import { error } from "@/lib/http";
export async function GET(){const s=await getSession();if(!s)return error("Unauthorized",401);return Response.redirect(getAuthUrl(signSession(s)));}
