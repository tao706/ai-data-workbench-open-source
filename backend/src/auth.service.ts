import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, passwordHash: derived.toString("hex") };
}

export async function verifyPassword(password: string, salt: string, passwordHash: string) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(passwordHash, "hex");
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}
