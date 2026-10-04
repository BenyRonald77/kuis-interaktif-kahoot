import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/quizzes/[pin] — detail kuis (tanpa jawaban benar)
export async function GET(
  _req: Request,
  { params }: { params: { pin: string } }
) {
  const quiz = await prisma.quiz.findUnique({
    where: { pin: params.pin },
    include: {
      questions: { orderBy: { order: "asc" } },
      participants: { orderBy: { id: "asc" } },
    },
  });
  if (!quiz) return NextResponse.json({ error: "kuis tidak ditemukan" }, { status: 404 });

  return NextResponse.json({
    pin: quiz.pin,
    title: quiz.title,
    status: quiz.status,
    createdAtMs: Number(quiz.createdAt),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      order: q.order,
      text: q.text,
      options: JSON.parse(q.options) as string[],
      durationSeconds: q.durationSeconds,
    })),
    participants: quiz.participants.map((p) => p.name),
  });
}
