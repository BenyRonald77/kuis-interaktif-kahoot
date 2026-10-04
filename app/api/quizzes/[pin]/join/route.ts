import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/events";
import { getQuizState } from "@/lib/quiz";

// POST /api/quizzes/[pin]/join
// - body { name }            → gabung baru; 409 bila nama sudah dipakai di room ini
// - body { name, rejoin:true } → peserta lama putus-sambung; pulihkan state penuh
export async function POST(
  req: NextRequest,
  { params }: { params: { pin: string } }
) {
  const quiz = await prisma.quiz.findUnique({ where: { pin: params.pin } });
  if (!quiz) return NextResponse.json({ error: "kuis tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "nama wajib diisi" }, { status: 400 });
  if (name.length > 30)
    return NextResponse.json({ error: "nama maksimal 30 karakter" }, { status: 400 });

  if (body?.rejoin === true) {
    const existing = await prisma.participant.findUnique({
      where: { quizId_name: { quizId: quiz.id, name } },
    });
    if (!existing)
      return NextResponse.json({ error: "nama belum terdaftar di room ini" }, { status: 404 });
    const state = await getQuizState(params.pin, name);
    return NextResponse.json({ name, rejoined: true, state }, { status: 200 });
  }

  try {
    const participant = await prisma.participant.create({
      data: { quizId: quiz.id, name, joinedAt: BigInt(Date.now()) },
    });
    publish(params.pin, "participant_joined", { name });
    const state = await getQuizState(params.pin, name);
    return NextResponse.json(
      { name: participant.name, rejoined: false, state },
      { status: 201 }
    );
  } catch (e: unknown) {
    // P2002 = nama sudah dipakai di room ini → 409
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: `nama "${name}" sudah dipakai di room ini` },
        { status: 409 }
      );
    }
    throw e;
  }
}
