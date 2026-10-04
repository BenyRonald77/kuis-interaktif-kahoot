import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/events";
import { computeScore, ensureLocked } from "@/lib/quiz";

// POST /api/quizzes/[pin]/rounds/answer — peserta menjawab soal aktif
// body: { name, selectedIndex }
export async function POST(
  req: NextRequest,
  { params }: { params: { pin: string } }
) {
  const quiz = await prisma.quiz.findUnique({
    where: { pin: params.pin },
    include: { questions: false },
  });
  if (!quiz) return NextResponse.json({ error: "kuis tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const selectedIndex = body?.selectedIndex;
  if (!name) return NextResponse.json({ error: "nama wajib diisi" }, { status: 400 });
  if (typeof selectedIndex !== "number" || !Number.isInteger(selectedIndex))
    return NextResponse.json({ error: "selectedIndex harus bilangan bulat" }, { status: 400 });

  const participant = await prisma.participant.findUnique({
    where: { quizId_name: { quizId: quiz.id, name } },
  });
  if (!participant)
    return NextResponse.json({ error: "peserta belum bergabung" }, { status: 404 });

  const nowMs = Date.now();
  // Auto-lock malas bila timer sudah habis (atomic)
  const justLocked = await ensureLocked(quiz.id, nowMs);

  const round = await prisma.round.findFirst({
    where: { quizId: quiz.id },
    orderBy: { id: "desc" },
    include: { question: true },
  });
  if (!round || round.status !== "active") {
    if (justLocked) publish(params.pin, "leaderboard_updated", { reason: "auto-lock" });
    return NextResponse.json(
      { error: "tidak ada soal aktif (sudah dikunci atau belum dimulai)" },
      { status: 409 }
    );
  }
  if (nowMs > Number(round.endsAtMs)) {
    // Seharusnya sudah terkunci oleh ensureLocked; pengaman bila clock skew
    await ensureLocked(quiz.id, nowMs);
    publish(params.pin, "leaderboard_updated", { reason: "auto-lock" });
    return NextResponse.json({ error: "waktu menjawab sudah habis" }, { status: 422 });
  }

  const options = JSON.parse(round.question.options) as string[];
  if (selectedIndex < 0 || selectedIndex >= options.length)
    return NextResponse.json({ error: "selectedIndex di luar rentang opsi" }, { status: 400 });

  const correct = selectedIndex === round.question.correctIndex;
  const elapsedMs = nowMs - Number(round.startedAtMs);
  const score = computeScore(correct, elapsedMs, round.question.durationSeconds * 1000);

  try {
    const answer = await prisma.answer.create({
      data: {
        roundId: round.id,
        participantId: participant.id,
        selectedIndex,
        correct,
        score,
        answeredAtMs: BigInt(nowMs),
      },
    });
    return NextResponse.json(
      {
        correct,
        score,
        elapsedMs,
        answeredAtMs: Number(answer.answeredAtMs),
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    // P2002 = sudah menjawab di ronde ini → 409
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "sudah menjawab soal ini" },
        { status: 409 }
      );
    }
    throw e;
  }
}
