import { prisma } from "./prisma";
import { publish } from "./events";

// ---------- PIN ----------
export function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---------- Skor ----------
// Benar: 1000 (instan) s.d. 500 (tepat di batas waktu). Salah: 0.
export function computeScore(
  correct: boolean,
  elapsedMs: number,
  durationMs: number
): number {
  if (!correct || durationMs <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return Math.round(1000 * (1 - 0.5 * ratio));
}

// ---------- Auto-lock malas (atomic, aman konkurensi) ----------
// Mengunci ronde aktif yang sudah lewat endsAt via single-statement updateMany.
// Mengembalikan true bila ada ronde yang dikunci (pemicu broadcast oleh pemanggil).
export async function ensureLocked(
  quizId: number,
  nowMs: number
): Promise<boolean> {
  const res = await prisma.round.updateMany({
    where: { quizId, status: "active", endsAtMs: { lt: BigInt(nowMs) } },
    data: { status: "locked" },
  });
  if (res.count > 0) {
    await prisma.quiz.update({
      where: { id: quizId },
      data: { status: "leaderboard" },
    });
    return true;
  }
  return false;
}

export async function lockActiveRound(quizId: number): Promise<boolean> {
  const res = await prisma.round.updateMany({
    where: { quizId, status: "active" },
    data: { status: "locked" },
  });
  if (res.count > 0) {
    await prisma.quiz.update({
      where: { id: quizId },
      data: { status: "leaderboard" },
    });
    return true;
  }
  return false;
}

// ---------- Leaderboard ----------
export type LeaderboardRow = {
  name: string;
  totalScore: number;
  correctCount: number;
  answerCount: number;
};

export async function getLeaderboard(quizId: number): Promise<LeaderboardRow[]> {
  const participants = await prisma.participant.findMany({
    where: { quizId },
    include: { answers: true },
    orderBy: { id: "asc" },
  });
  const rows: LeaderboardRow[] = participants.map((p) => ({
    name: p.name,
    totalScore: p.answers.reduce((s, a) => s + a.score, 0),
    correctCount: p.answers.filter((a) => a.correct).length,
    answerCount: p.answers.length,
  }));
  rows.sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      b.correctCount - a.correctCount ||
      a.name.localeCompare(b.name)
  );
  return rows;
}

export type RoundResultRow = {
  name: string;
  selectedIndex: number;
  correct: boolean;
  score: number;
};

export async function getRoundResults(roundId: number): Promise<RoundResultRow[]> {
  const answers = await prisma.answer.findMany({
    where: { roundId },
    include: { participant: true },
    orderBy: [{ score: "desc" }, { answeredAtMs: "asc" }],
  });
  return answers.map((a) => ({
    name: a.participant.name,
    selectedIndex: a.selectedIndex,
    correct: a.correct,
    score: a.score,
  }));
}

// ---------- State (untuk polling & rejoin) ----------
export async function getQuizState(pin: string, viewerName?: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { pin },
    include: {
      questions: { orderBy: { order: "asc" } },
      participants: { orderBy: { id: "asc" } },
    },
  });
  if (!quiz) return null;

  const nowMs = Date.now();
  const locked = await ensureLocked(quiz.id, nowMs);
  if (locked) publish(pin, "leaderboard_updated", { reason: "auto-lock" });

  const round = await prisma.round.findFirst({
    where: { quizId: quiz.id },
    orderBy: { id: "desc" },
    include: { question: true },
  });

  let myAnswers: { questionId: number; selectedIndex: number; correct: boolean | null; score: number }[] = [];
  if (viewerName) {
    const me = await prisma.participant.findUnique({
      where: { quizId_name: { quizId: quiz.id, name: viewerName } },
      include: { answers: { include: { round: true } } },
    });
    if (me) {
      myAnswers = me.answers.map((a) => ({
        questionId: a.round.questionId,
        selectedIndex: a.selectedIndex,
        correct: a.round.status === "locked" ? a.correct : null,
        score: a.round.status === "locked" ? a.score : 0,
      }));
    }
  }

  const leaderboard = await getLeaderboard(quiz.id);
  const roundResults =
    round && round.status === "locked" ? await getRoundResults(round.id) : [];

  return {
    pin: quiz.pin,
    title: quiz.title,
    status: quiz.status,
    questionCount: quiz.questions.length,
    participants: quiz.participants.map((p) => p.name),
    round: round
      ? {
          questionId: round.questionId,
          order: round.question.order,
          text: round.question.text,
          options: JSON.parse(round.question.options) as string[],
          durationSeconds: round.question.durationSeconds,
          status: round.status,
          startedAtMs: Number(round.startedAtMs),
          endsAtMs: Number(round.endsAtMs),
          serverNowMs: nowMs,
          // Kunci jawaban hanya dibocorkan setelah lock
          correctIndex: round.status === "locked" ? round.question.correctIndex : null,
        }
      : null,
    myAnswers,
    roundResults,
    leaderboard,
  };
}
