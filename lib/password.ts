import crypto from "node:crypto";
export function hashPassword(password: string) { const salt = crypto.randomBytes(16).toString("hex"); const derived = crypto.scryptSync(password, salt, 64).toString("hex"); return `${salt}:${derived}`; }
export function verifyPassword(password: string, stored: string) { const [salt, key] = stored.split(":"); if (!salt || !key) return false; const derived = crypto.scryptSync(password, salt, 64).toString("hex"); return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(key, "hex")); }
