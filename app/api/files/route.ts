import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveActor } from "@/lib/security/actor";
import { listFiles } from "@/lib/workspace/files";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const querySchema = z.object({
  view: z.enum(["documents", "starred", "trash"]).default("documents"),
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(["date", "name", "size"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * My Documents / Starred / Trash listing — requires a real signed-in user
 * (guests have no persistent workspace). Never processes anything; this is
 * a plain read against already-owned rows (blueprint §4: no processing
 * logic in API routes).
 */
export async function GET(request: NextRequest) {
  const actor = await resolveActor();
  if (actor.type !== "user") {
    return apiError("AUTH_REQUIRED");
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR");
  }

  const result = await listFiles({ userId: actor.userId, ...parsed.data });
  return NextResponse.json(result);
}
