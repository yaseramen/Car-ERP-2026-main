import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const hasSecret = !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
  const hasTurso = !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);

  return NextResponse.json({
    status: hasSecret && hasTurso ? "ok" : "config_error",
    auth: hasSecret ? "configured" : "missing_secret",
    database: hasTurso ? "configured" : "missing",
  });
}
