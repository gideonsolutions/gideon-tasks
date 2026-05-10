import { NextResponse } from "next/server";
import { query } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await query("SELECT 1");
    return NextResponse.json({ status: "healthy", database: "ok" });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503 },
    );
  }
}
