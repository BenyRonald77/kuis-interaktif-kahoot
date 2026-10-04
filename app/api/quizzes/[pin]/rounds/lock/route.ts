import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/events";
import { lockActiveRound, getLeaderboard, getRoundResults } from "@/lib/quiz";

// POST /api/quizzes/[pin]/rounds/lock — host mengunci jawaban
export async function POST(
  _req: Request,
  { params }: { params: { pin: string } }
) {
  const quiz = await prisma.quiz.findUnique({ where: { pin: params.pin } });
  if (!quiz) return NextResponse.json({ error: "kuis tidak ditemukan" }, { status: 404 });

  const locked = await lockActiveRound(quiz.id);
  if (!locked)
    return NextResponse.json({ error: "tidak ada ronde aktif" }, { status: 409 });

  const round = await prisma.round.findFirst({
    where: { quizId: quiz.id },
    orderBy: { id: "desc" },
    include: { question: true },
  });

  publish(params.pin, "question_locked", {
    questionId: round?.questionId,
    correctIndex: round?.question.correctIndex,
  });
  const leaderboard = await getLeaderboard(quiz.id);
  publish(params.pin, "leaderboard_updated", { leaderboard });
  const roundResults = round ? await getRoundResults(round.id) : [];

  return NextResponse.json({
    locked: true,
    questionId: round?.questionId,
    correctIndex: round?.question.correctIndex,
    roundResults,
    leaderboard,
  });
}
