import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/events";
import { lockActiveRound } from "@/lib/quiz";

// POST /api/quizzes/[pin]/questions/[qid]/start — host memulai soal
export async function POST(
  _req: Request,
  { params }: { params: { pin: string; qid: string } }
) {
  const quiz = await prisma.quiz.findUnique({ where: { pin: params.pin } });
  if (!quiz) return NextResponse.json({ error: "kuis tidak ditemukan" }, { status: 404 });
  if (quiz.status === "finished")
    return NextResponse.json({ error: "kuis sudah selesai" }, { status: 409 });

  const question = await prisma.question.findFirst({
    where: { id: Number(params.qid), quizId: quiz.id },
  });
  if (!question)
    return NextResponse.json({ error: "soal tidak ditemukan" }, { status: 404 });

  // Kunci ronde aktif sebelumnya (atomic), bila ada
  await lockActiveRound(quiz.id);

  const nowMs = Date.now();
  const durationMs = question.durationSeconds * 1000;
  const round = await prisma.round.upsert({
    where: { quizId_questionId: { quizId: quiz.id, questionId: question.id } },
    update: { status: "active", startedAtMs: BigInt(nowMs), endsAtMs: BigInt(nowMs + durationMs) },
    create: {
      quizId: quiz.id,
      questionId: question.id,
      status: "active",
      startedAtMs: BigInt(nowMs),
      endsAtMs: BigInt(nowMs + durationMs),
    },
  });

  await prisma.quiz.update({
    where: { id: quiz.id },
    data: { status: "question", currentQuestionId: question.id, currentRoundId: round.id },
  });

  publish(params.pin, "question_started", {
    questionId: question.id,
    order: question.order,
    text: question.text,
    options: JSON.parse(question.options) as string[],
    durationSeconds: question.durationSeconds,
    startedAtMs: nowMs,
    endsAtMs: nowMs + durationMs,
  });

  return NextResponse.json({
    roundId: round.id,
    questionId: question.id,
    startedAtMs: nowMs,
    endsAtMs: nowMs + durationMs,
  });
}
