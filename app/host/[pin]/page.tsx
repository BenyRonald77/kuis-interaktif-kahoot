"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State = {
  pin: string;
  title: string;
  status: string;
  questionCount: number;
  participants: string[];
  round: {
    questionId: number;
    order: number;
    text: string;
    options: string[];
    durationSeconds: number;
    status: string;
    startedAtMs: number;
    endsAtMs: number;
    serverNowMs: number;
    correctIndex: number | null;
  } | null;
  roundResults: { name: string; selectedIndex: number; correct: boolean; score: number }[];
  leaderboard: { name: string; totalScore: number; correctCount: number }[];
};

export default function HostPage({ params }: { params: { pin: string } }) {
  const { pin } = params;
  const [state, setState] = useState<State | null>(null);
  const [questions, setQuestions] = useState<{ id: number; order: number; text: string; durationSeconds: number }[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/quizzes/${pin}/state`);
      if (res.ok) setState(await res.json());
      const qres = await fetch(`/api/quizzes/${pin}`);
      if (qres.ok) setQuestions((await qres.json()).questions);
    } catch {
      /* abaikan, coba lagi via polling */
    }
  }, [pin]);

  useEffect(() => {
    refresh();
    const es = new EventSource(`/api/quizzes/${pin}/events`);
    esRef.current = es;
    es.onmessage = () => refresh();
    es.addEventListener("question_started", () => refresh());
    es.addEventListener("question_locked", () => refresh());
    es.addEventListener("leaderboard_updated", () => refresh());
    es.addEventListener("participant_joined", () => refresh());
    es.addEventListener("quiz_finished", () => refresh());
    es.onerror = () => {
      // fallback: polling tiap 2 detik bila SSE putus
      const t = setInterval(refresh, 2000);
      es.close();
      setTimeout(() => clearInterval(t), 30000);
    };
    const tick = setInterval(() => setNow(Date.now()), 500);
    // polling ringan sebagai cadangan
    const poll = setInterval(refresh, 5000);
    return () => {
      es.close();
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [pin, refresh]);

  const post = async (url: string) => {
    setError("");
    const res = await fetch(url, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "gagal");
    await refresh();
  };

  const active = state?.round && state.round.status === "active";
  const remainMs = active ? Math.max(0, state!.round!.endsAtMs - now) : 0;

  // Host otomatis mengunci saat countdown habis
  useEffect(() => {
    if (active && remainMs <= 0) {
      fetch(`/api/quizzes/${pin}/rounds/lock`, { method: "POST" })
        .then(() => refresh())
        .catch(() => {});
    }
  }, [active, remainMs, pin, refresh]);

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{state?.title ?? "Memuat…"}</h1>
          <p className="text-slate-500">Status: {state?.status}</p>
        </div>
        <div className="text-center rounded-xl bg-indigo-600 px-6 py-3 text-white">
          <div className="text-xs uppercase">PIN</div>
          <div className="text-3xl font-mono font-bold tracking-widest">{pin}</div>
        </div>
      </header>

      {error && <div className="rounded bg-red-100 px-4 py-2 text-red-800">{error}</div>}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold mb-2">Peserta ({state?.participants.length ?? 0})</h2>
          <ul className="flex flex-wrap gap-2">
            {(state?.participants ?? []).map((n) => (
              <li key={n} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{n}</li>
            ))}
          </ul>
          {(!state || state.participants.length === 0) && (
            <p className="text-sm text-slate-400">Belum ada peserta. Bagikan PIN di atas.</p>
          )}
        </section>

        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold mb-2">Soal</h2>
          <ul className="space-y-2">
            {questions.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                <span className="text-sm">
                  <b>{q.order}.</b> {q.text} <span className="text-slate-400">({q.durationSeconds}s)</span>
                </span>
                <button
                  onClick={() => post(`/api/quizzes/${pin}/questions/${q.id}/start`)}
                  className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white"
                >
                  Mulai
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {active && (
        <section className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Soal {state!.round!.order} sedang berjalan</div>
              <div className="text-sm text-slate-500">{state!.round!.text}</div>
            </div>
            <div className={`text-3xl font-mono font-bold ${remainMs < 5000 ? "text-red-600" : "text-indigo-700"}`}>
              {(remainMs / 1000).toFixed(1)}s
            </div>
          </div>
          <button
            onClick={() => post(`/api/quizzes/${pin}/rounds/lock`)}
            className="mt-3 rounded bg-amber-600 px-4 py-2 font-semibold text-white"
          >
            Kunci Jawaban Sekarang
          </button>
        </section>
      )}

      {state?.roundResults && state.roundResults.length > 0 && (
        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold mb-2">Hasil soal terakhir</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th>Peserta</th><th>Benar</th><th>Skor</th></tr></thead>
            <tbody>
              {state.roundResults.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="py-1">{r.name}</td>
                  <td>{r.correct ? "✅" : "❌"}</td>
                  <td className="font-mono">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold mb-2">Leaderboard</h2>
        <ol className="space-y-1">
          {(state?.leaderboard ?? []).map((r, i) => (
            <li key={r.name} className="flex justify-between rounded bg-slate-50 px-3 py-2">
              <span><b>#{i + 1}</b> {r.name} <span className="text-xs text-slate-400">({r.correctCount} benar)</span></span>
              <span className="font-mono font-bold">{r.totalScore}</span>
            </li>
          ))}
        </ol>
        {state?.status !== "finished" && (
          <button
            onClick={() => post(`/api/quizzes/${pin}/finish`)}
            className="mt-3 rounded bg-slate-700 px-4 py-2 font-semibold text-white"
          >
            Akhiri Kuis
          </button>
        )}
      </section>
    </main>
  );
}
