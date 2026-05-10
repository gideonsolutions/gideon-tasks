import "server-only";
import { NextResponse } from "next/server";
import { z, type ZodSchema } from "zod";
import { badRequest } from "./errors";

/**
 * Fields that come back from Postgres as BIGINT strings via the Neon
 * serverless driver. Re-cast to JS numbers before sending to clients
 * so the frontend doesn't accidentally string-concat them.
 */
const NUMERIC_KEYS = new Set<string>([
  "price_cents",
  "task_price_cents",
  "gideon_fee_cents",
  "stripe_fee_cents",
  "total_charged_cents",
  "doer_payout_cents",
]);

function coerceRow<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (NUMERIC_KEYS.has(key)) {
      const v = out[key];
      if (typeof v === "string" && v !== "") {
        (out as Record<string, unknown>)[key] = Number(v);
      }
    }
  }
  return out;
}

function coerceValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(coerceValue) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    return coerceRow(value as Record<string, unknown>) as unknown as T;
  }
  return value;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(coerceValue(data), { status });
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
