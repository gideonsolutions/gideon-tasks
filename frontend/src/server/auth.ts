import "server-only";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { env } from "./env";
import { unauthorized, forbidden } from "./errors";
import { v7 as uuidv7 } from "uuid";

const enc = new TextEncoder();
const key = enc.encode(env.jwtSecret);

export interface Claims {
  sub: string;
  is_admin: boolean;
  trust_level: number;
  exp: number;
  iat: number;
}

export async function createAccessToken(
  userId: string,
  isAdmin: boolean,
  trustLevel: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ is_admin: isAdmin, trust_level: trustLevel })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + env.jwtAccessExpirySecs)
    .sign(key);
}

export async function decodeAccessToken(token: string): Promise<Claims> {
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as Claims;
  } catch (e) {
    throw unauthorized(`Invalid token: ${(e as Error).message}`);
  }
}

export interface AuthUser {
  userId: string;
  isAdmin: boolean;
  trustLevel: number;
}

export async function requireAuth(req: Request): Promise<AuthUser> {
  const header = req.headers.get("authorization");
  if (!header) throw unauthorized("Missing Authorization header");
  if (!header.startsWith("Bearer "))
    throw unauthorized("Invalid Authorization header format");
  const token = header.slice(7);
  const claims = await decodeAccessToken(token);
  return {
    userId: claims.sub,
    isAdmin: claims.is_admin,
    trustLevel: claims.trust_level,
  };
}

export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await requireAuth(req);
  if (!user.isAdmin) throw forbidden("Admin access required");
  return user;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newId(): string {
  return uuidv7();
}
