"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State = {
  pin: string;
  title: string;
  status: string;
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
  myAnswers: { questionId: number; selectedIndex: number; correct: boolean | null; score: number }[];
  roundResults: { name: string; selectedIndex: number; correct: boolean; score: number }[];
  leaderboard: { name: string; totalScore: number; correctCount: number }[];
};

const COLORS = ["bg-red-500", "bg-blue-500", "bg-amber-500", "bg-green-600"];

export default function PlayerPage({ params }: { params: { pin: string } }) {
  const { pin } = params;
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [rejoinMode, setRejoinMode] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [answering, setAnswering] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!name) return;
    try {
      const res = await fetch(`/api/quizzes/${pin}/state?name=${encodeURIComponent(name)}`);
      if (res.ok) setState(await res.json());
    } catch {
      /* abaikan */
    }
  }, [pin, name]);

  useEffect(() => {
    const saved = sessionStorage.getItem(`kuis-nama-${pin}`);
    if (saved) {
      setName(saved);
      setJoined(true);
    }
  }, [pin]);

  useEffect(() => {
    if (!joined || !name) return;
    refresh();
    const es = new EventSource(`/api/quizzes/${pin}/events`);
    const onEvent = () => refresh();
    es.addEventListener("question_started", onEvent);
    es.addEventListener("question_locked", onEvent);
    es.addEventListener("leaderboard_updated", onEvent);
    es.addEventListener("quiz_finished", onEvent);
    es.onerror = () => {
      const t = setInterval(refresh, 2000);
      setTimeout(() => { es.close(); clearInterval(t); }, 20000);
    };
    const tick = setInterval(() => setNow(Date.now()), 500);
    const poll = setInterval(refresh, 5000);
    return () => {
      es.close();
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [joined, name, pin, refresh]);

  const doJoin = async (rejoin: boolean) => {
    setError("");
    const res = await fetch(`/api/quizzes/${pin}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), ...(rejoin ? { rejoin: true } : {}) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "gagal gabung");
      return;
    }
    sessionStorage.setItem(`kuis-nama-${pin}`, name.trim());
    setState(data.state);
    setJoined(true);
  };

  const answer = async (idx: number) => {
    setAnswering(true);
    setError("");
    const res = await fetch(`/api/quizzes/${pin}/rounds/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, selectedIndex: idx }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "gagal menjawab");
    setAnswering(false);
    await refresh();
  };

  if (!joined) {
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="rounded-xl bg-white p-6 shadow space-y-4">
          <h1 className="text-xl font-bold">Gabung Kuis <span className="font-mono text-indigo-700">{pin}</span></h1>
          {error && <div className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</div>}
          <input
            className="w-full rounded border px-3 py-2"
            placeholder="Nama kamu"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={() => doJoin(false)}
              disabled={!name.trim()}
              className="flex-1 rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              Gabung
            </button>
            <button
              onClick={() => { setRejoinMode(true); doJoin(true); }}
              disabled={!name.trim()}
              className="rounded border px-4 py-2 disabled:opacity-50"
              title="Putus sambung? Masuk lagi dengan nama yang sama"
            >
              Rejoin
            </button>
          </div>
          {rejoinMode && <p className="text-xs text-slate-500">Mode rejoin: state kamu akan dipulihkan.</p>}
        </div>
      </main>
    );
  }

  const round = state?.round;
  const active = round && round.status === "active";
  const remainMs = active ? Math.max(0, round.endsAtMs - now) : 0;
  const myAnswer = round ? state?.myAnswers.find((a) => a.questionId === round.questionId) : undefined;

  return (
    <main className="mx-auto max-w-xl p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{state?.title ?? "…"}</h1>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-800">{name}</span>
      </header>
      {error && <div className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</div>}

      {state?.status === "finished" ? (
        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold mb-2">Kuis selesai! 🏁</h2>
          <Leaderboard rows={state.leaderboard} />
        </section>
      ) : !round ? (
        <section className="rounded-xl bg-white p-6 shadow text-center">
          <p className="text-lg">Menunggu host memulai soal…</p>
          <p className="text-sm text-slate-500 mt-2">Peserta: {(state?.participants ?? []).join(", ") || "—"}</p>
        </section>
      ) : (
        <section className="rounded-xl bg-white p-6 shadow space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Soal {round.order}</span>
            {active && (
              <span className={`font-mono text-2xl font-bold ${remainMs < 5000 ? "text-red-600" : "text-indigo-700"}`}>
                {(remainMs / 1000).toFixed(1)}s
              </span>
            )}
            {round.status === "locked" && <span className="text-sm text-slate-500">Terkunci</span>}
          </div>
          <p className="text-lg">{round.text}</p>
          <div className="grid gap-2">
            {round.options.map((opt, i) => {
              const isMine = myAnswer?.selectedIndex === i;
              const isCorrect = round.status === "locked" && round.correctIndex === i;
              return (
                <button
                  key={i}
                  disabled={!active || !!myAnswer || answering}
                  onClick={() => answer(i)}
                  className={`rounded-lg px-4 py-3 text-left font-semibold text-white disabled:cursor-default ${COLORS[i % COLORS.length]} ${
                    isMine ? "ring-4 ring-slate-900" : ""
                  } ${isCorrect ? "ring-4 ring-green-300" : ""} ${
                    !active || myAnswer ? "opacity-90" : "hover:opacity-90"
                  }`}
                >
                  {opt} {isCorrect && "✓"}
                </button>
              );
            })}
          </div>
          {myAnswer && active && (
            <p className="text-sm text-slate-500">Jawaban terkirim. Menunggu soal dikunci…</p>
          )}
          {myAnswer && round.status === "locked" && (
            <p className="text-sm font-semibold">
              {myAnswer.correct ? `Benar! +${myAnswer.score} poin` : "Kurang tepat."}
            </p>
          )}
        </section>
      )}

      {state && state.leaderboard.length > 0 && state.status !== "lobby" && (
        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold mb-2">Leaderboard</h2>
          <Leaderboard rows={state.leaderboard} highlight={name} />
        </section>
      )}
    </main>
  );
}

function Leaderboard({
  rows,
  highlight,
}: {
  rows: { name: string; totalScore: number; correctCount: number }[];
  highlight?: string;
}) {
  return (
    <ol className="space-y-1">
      {rows.map((r, i) => (
        <li
          key={r.name}
          className={`flex justify-between rounded px-3 py-2 ${
            r.name === highlight ? "bg-indigo-100 font-semibold" : "bg-slate-50"
          }`}
        >
          <span><b>#{i + 1}</b> {r.name}</span>
          <span className="font-mono font-bold">{r.totalScore}</span>
        </li>
      ))}
    </ol>
  );
}
