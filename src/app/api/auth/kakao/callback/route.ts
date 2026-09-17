import { handleCallback } from "@/server/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleCallback("kakao", request);
}
