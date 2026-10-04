import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/events";
import { lockActiveRound, getLeaderboard } from "@/lib/quiz";

// POST /api/quizzes/[pin]/finish — host mengakhiri kuis
export async function POST(
  _req: Request,
  { params }: { params: { pin: string } }
) {
  const quiz = await prisma.quiz.findUnique({ where: { pin: params.pin } });
  if (!quiz) return NextResponse.json({ error: "kuis tidak ditemukan" }, { status: 404 });

  await lockActiveRound(quiz.id);
  await prisma.quiz.update({ where: { id: quiz.id }, data: { status: "finished" } });

  const leaderboard = await getLeaderboard(quiz.id);
  publish(params.pin, "quiz_finished", { leaderboard });

  return NextResponse.json({ finished: true, leaderboard });
}
