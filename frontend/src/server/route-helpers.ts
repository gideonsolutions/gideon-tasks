import "server-only";
import { NextResponse } from "next/server";
import { z, type ZodSchema } from "zod";
import { badRequest } from "./errors";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join(".");
    throw badRequest(path ? `${path}: ${issue.message}` : issue.message);
  }
  return result.data;
}

export const uuidSchema = z.string().uuid();
