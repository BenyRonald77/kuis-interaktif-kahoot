import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLeaderboard, getRoundResults, ensureLocked } from "@/lib/quiz";

// GET /api/quizzes/[pin]/leaderboard — leaderboard total + hasil ronde terakhir
export async function GET(
  _req: Request,
  { params }: { params: { pin: string } }
) {
  const quiz = await prisma.quiz.findUnique({ where: { pin: params.pin } });
  if (!quiz) return NextResponse.json({ error: "kuis tidak ditemukan" }, { status: 404 });

  await ensureLocked(quiz.id, Date.now());

  const leaderboard = await getLeaderboard(quiz.id);
  const lastRound = await prisma.round.findFirst({
    where: { quizId: quiz.id },
    orderBy: { id: "desc" },
    include: { question: true },
  });

  return NextResponse.json({
    pin: quiz.pin,
    title: quiz.title,
    status: quiz.status,
    leaderboard,
    lastRound: lastRound
      ? {
          questionId: lastRound.questionId,
          order: lastRound.question.order,
          text: lastRound.question.text,
          status: lastRound.status,
          // Kunci jawaban hanya setelah lock
          correctIndex:
            lastRound.status === "locked" ? lastRound.question.correctIndex : null,
          results:
            lastRound.status === "locked"
              ? await getRoundResults(lastRound.id)
              : [],
        }
      : null,
  });
}
