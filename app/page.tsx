"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DraftQ = { text: string; options: string[]; correctIndex: number; durationSeconds: number };

const emptyQ = (): DraftQ => ({
  text: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  durationSeconds: 20,
});

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<DraftQ[]>([emptyQ()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");

  const setQ = (i: number, patch: Partial<DraftQ>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const createQuiz = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          questions: questions.map((q) => ({
            text: q.text,
            options: q.options.filter((o) => o.trim() !== ""),
            correctIndex: q.correctIndex,
            durationSeconds: q.durationSeconds,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "gagal membuat kuis");
      router.push(`/host/${data.pin}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "gagal membuat kuis");
    } finally {
      setBusy(false);
    }
  };

  const joinQuiz = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quizzes/${pin.trim()}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "gagal gabung");
      sessionStorage.setItem(`kuis-nama-${pin.trim()}`, name.trim());
      router.push(`/main/${pin.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "gagal gabung");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-indigo-700">Kuis Interaktif</h1>
        <p className="text-slate-500">Buat kuis sebagai host, atau gabung dengan PIN sebagai peserta.</p>
      </header>

      {error && <div className="rounded bg-red-100 px-4 py-2 text-red-800">{error}</div>}

      <section className="rounded-xl bg-white p-6 shadow space-y-4">
        <h2 className="text-xl font-semibold">Gabung sebagai peserta</h2>
        <div className="flex gap-2">
          <input
            className="w-32 rounded border px-3 py-2"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
          />
          <input
            className="flex-1 rounded border px-3 py-2"
            placeholder="Nama kamu"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={joinQuiz}
            disabled={busy || !pin.trim() || !name.trim()}
            className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            Gabung
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow space-y-4">
        <h2 className="text-xl font-semibold">Buat kuis baru (host)</h2>
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="Judul kuis"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {questions.map((q, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Soal {i + 1}</span>
              {questions.length > 1 && (
                <button
                  className="text-sm text-red-600"
                  onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                >
                  Hapus
                </button>
              )}
            </div>
            <input
              className="w-full rounded border px-3 py-2"
              placeholder="Teks soal"
              value={q.text}
              onChange={(e) => setQ(i, { text: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              {q.options.map((o, oi) => (
                <label key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${i}`}
                    checked={q.correctIndex === oi}
                    onChange={() => setQ(i, { correctIndex: oi })}
                    title="Jawaban benar"
                  />
                  <input
                    className="w-full rounded border px-2 py-1"
                    placeholder={`Opsi ${oi + 1}`}
                    value={o}
                    onChange={(e) =>
                      setQ(i, { options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Durasi (detik):
              <input
                type="number"
                min={5}
                max={120}
                className="w-20 rounded border px-2 py-1"
                value={q.durationSeconds}
                onChange={(e) => setQ(i, { durationSeconds: Number(e.target.value) })}
              />
              <span className="text-xs">(radio = jawaban benar)</span>
            </label>
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={() => setQuestions((qs) => [...qs, emptyQ()])}
            className="rounded border px-4 py-2"
          >
            + Tambah soal
          </button>
          <button
            onClick={createQuiz}
            disabled={busy || !title.trim()}
            className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            Buat Kuis &amp; Dapat PIN
          </button>
        </div>
      </section>
    </main>
  );
}
