import { NextRequest, NextResponse } from "next/server";
import { getQuizState } from "@/lib/quiz";

// GET /api/quizzes/[pin]/state?name=... — state penuh untuk polling & rejoin
export async function GET(
  req: NextRequest,
  { params }: { params: { pin: string } }
) {
  const name = req.nextUrl.searchParams.get("name") ?? undefined;
  const state = await getQuizState(params.pin, name);
  if (!state) return NextResponse.json({ error: "kuis tidak ditemukan" }, { status: 404 });
  return NextResponse.json(state);
}
