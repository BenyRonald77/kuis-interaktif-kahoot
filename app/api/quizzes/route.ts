import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePin } from "@/lib/quiz";

type QuestionInput = {
  text?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  durationSeconds?: unknown;
};

function validateQuestions(input: unknown): { ok: boolean; error?: string } {
  if (!Array.isArray(input) || input.length === 0)
    return { ok: false, error: "questions harus array tidak kosong" };
  if (input.length > 50)
    return { ok: false, error: "maksimal 50 soal per kuis" };
  for (let i = 0; i < input.length; i++) {
    const q = input[i] as QuestionInput;
    if (!q || typeof q.text !== "string" || q.text.trim().length === 0)
      return { ok: false, error: `soal #${i + 1}: teks wajib diisi` };
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4)
      return { ok: false, error: `soal #${i + 1}: opsi harus 2-4 buah` };
    for (const o of q.options)
      if (typeof o !== "string" || o.trim().length === 0)
        return { ok: false, error: `soal #${i + 1}: opsi tidak boleh kosong` };
    if (
      typeof q.correctIndex !== "number" ||
      !Number.isInteger(q.correctIndex) ||
      q.correctIndex < 0 ||
      q.correctIndex >= (q.options as unknown[]).length
    )
      return { ok: false, error: `soal #${i + 1}: correctIndex di luar rentang` };
    if (
      typeof q.durationSeconds !== "number" ||
      !Number.isInteger(q.durationSeconds) ||
      q.durationSeconds < 5 ||
      q.durationSeconds > 120
    )
      return { ok: false, error: `soal #${i + 1}: durasi harus 5-120 detik` };
  }
  return { ok: true };
}

// POST /api/quizzes — host membuat kuis, dapat PIN unik
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title wajib diisi" }, { status: 400 });

  const v = validateQuestions(body?.questions);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const questions = body.questions as {
    text: string;
    options: string[];
    correctIndex: number;
    durationSeconds: number;
  }[];

  // PIN 6 digit unik, retry bila tabrakan
  let quiz = null;
  for (let attempt = 0; attempt < 10 && !quiz; attempt++) {
    const pin = generatePin();
    try {
      quiz = await prisma.quiz.create({
        data: {
          pin,
          title,
          status: "lobby",
          createdAt: BigInt(Date.now()),
          questions: {
            create: questions.map((q, i) => ({
              order: i + 1,
              text: q.text.trim(),
              options: JSON.stringify(q.options.map((o) => o.trim())),
              correctIndex: q.correctIndex,
              durationSeconds: q.durationSeconds,
            })),
          },
        },
        include: { questions: { orderBy: { order: "asc" } } },
      });
    } catch (e: unknown) {
      // P2002 = PIN tabrakan, coba lagi; error lain lempar
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code !== "P2002"
      )
        throw e;
    }
  }
  if (!quiz)
    return NextResponse.json({ error: "gagal membuat PIN unik" }, { status: 500 });

  return NextResponse.json(
    {
      pin: quiz.pin,
      title: quiz.title,
      status: quiz.status,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        order: q.order,
        text: q.text,
        options: JSON.parse(q.options) as string[],
        durationSeconds: q.durationSeconds,
      })),
    },
    { status: 201 }
  );
}
