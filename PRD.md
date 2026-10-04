# PRD — Kuis Interaktif ala Kahoot

## Ringkasan
Aplikasi kuis interaktif multipemain ala Kahoot. Host membuat kuis (judul + daftar soal), mendapatkan kode PIN unik, lalu mengontrol alur permainan soal-per-soal. Peserta bergabung dengan PIN + nama, menjawab soal secara sinkron, dan melihat leaderboard. Bahasa UI: Indonesia.

## Stack
Next.js 14 (App Router) + TypeScript + Prisma 5.22 + SQLite + Tailwind CSS.

## Peran
- **Host**: membuat kuis, membagikan PIN, memulai soal, mengunci jawaban saat timer habis, melihat leaderboard.
- **Peserta**: gabung dengan PIN + nama, menjawab soal aktif, melihat leaderboard.

## Fungsionalitas

### F0 — Fondasi
Repo, PRD ini, skema Prisma, seed 1 kuis contoh (5 soal), konfigurasi build.

### F1 — Host membuat kuis (PIN)
- `POST /api/quizzes` body: `{ title, questions: [{ text, options[2..4], correctIndex, durationSeconds }] }`.
- Validasi: judul wajib, tiap soal punya 2–4 opsi, `correctIndex` dalam rentang, durasi 5–120 detik → 400 bila tidak valid.
- Mengembalikan `{ pin }` — PIN 6 digit unik (retry bila tabrakan).
- `GET /api/quizzes/[pin]` — detail kuis + daftar soal (tanpa membocorkan jawaban benar ke peserta; host UI memakai endpoint yang sama, jawaban benar hanya dipakai saat lock/leaderboard).

### F2 — Peserta gabung (PIN + nama)
- `POST /api/quizzes/[pin]/join` body: `{ name }`.
- Nama wajib, unik per room → 409 bila nama sudah dipakai (oleh peserta lain).
- Rejoin: nama + PIN yang sama mengembalikan state penuh (soal aktif, jawaban yang sudah dikirim, skor) — toleran putus-sambung. Tidak bisa menjawab dua kali untuk soal yang sama → 409.

### F3 — Alur soal + realtime
- Host: `POST /api/quizzes/[pin]/questions/[qid]/start` → membuat ronde aktif (`startedAt`, `endsAt = startedAt + durationSeconds*1000`), broadcast SSE `question_started`. Hanya satu ronde aktif per kuis; memulai soal baru otomatis mengunci ronde sebelumnya.
- Host: `POST /api/quizzes/[pin]/rounds/lock` → mengunci ronde aktif, broadcast `question_locked` + `leaderboard_updated`. Status kuis → `leaderboard`.
- Host: `POST /api/quizzes/[pin]/finish` → status `finished`, broadcast `quiz_finished`.
- Auto-lock malas (lazy): setiap request `state`/`answer` memeriksa `Date.now() > endsAt` → ronde dikunci otomatis via `updateMany` kondisional (atomic, aman konkurensi). UI host juga memicu lock saat countdown mencapai 0.

### F4 — Jawaban + skor
- `POST /api/quizzes/[pin]/rounds/answer` body: `{ name, selectedIndex }`.
- Aturan: ronde harus aktif (bukan locked) → 409; belum lewat `endsAt` → 422 bila terlambat; `selectedIndex` valid → 400; peserta terdaftar → 404; satu jawaban per peserta per ronde → 409 (dijamin unique constraint `(roundId, participantId)`).
- Skor: benar = `round(1000 * (1 - 0.5 * elapsed/duration))` → 1000 (instan) s.d. 500 (tepat di batas waktu); salah = 0.

### F5 — Leaderboard
- `GET /api/quizzes/[pin]/leaderboard` → total skor per peserta (desc), plus per-soal terakhir bila ada ronde terkunci (jawaban benar ditampilkan hanya setelah lock).
- `GET /api/quizzes/[pin]/state?name=...` → status kuis, ronde aktif (tanpa kunci jawaban bila belum lock), jawaban peserta, leaderboard ringkas — dipakai untuk polling fallback & rejoin.

### F6 — UI
- `/` — beranda: buat kuis (host) / gabung (peserta).
- `/host/[pin]` — dashboard host: PIN besar, daftar peserta (live via SSE), daftar soal + tombol mulai, countdown + tombol kunci, leaderboard.
- `/main/[pin]` — peserta: form nama → lobby → soal aktif (opsi + countdown) → hasil per soal → leaderboard.

## Transport realtime — CATATAN TEKNIS JUJUR
Next.js route handler **tidak bisa** melakukan WebSocket upgrade. Maka:
- **SSE** (`GET /api/quizzes/[pin]/events`, `Content-Type: text/event-stream`) dipakai untuk broadcast satu-arah server→klien: `question_started`, `question_locked`, `leaderboard_updated`, `quiz_finished`, `participant_joined`. Bisa dites via curl (lihat README).
- **HTTP polling** (`GET .../state`) sebagai fallback bila SSE terputus.
- Keterbatasan jujur: hub SSE bersifat **in-process** (satu instance Node). Deploy multi-instance butuh broker eksternal (Redis pub/sub) — di luar cakupan PRD ini. Single-instance (dev maupun `next start` tunggal) bekerja penuh.

## Model data
- `Quiz(id, pin unique, title, status[lobby|question|leaderboard|finished], currentQuestionId?, currentRoundId?, createdAt)`
- `Question(id, quizId, order, text, options Json[string[]], correctIndex, durationSeconds)`
- `Participant(id, quizId, name, unique(quizId,name), joinedAt)`
- `Round(id, quizId, questionId, status[active|locked], startedAtMs, endsAtMs, unique(quizId,questionId))`
- `Answer(id, roundId, participantId, selectedIndex, correct, score, answeredAtMs, unique(roundId,participantId))`
- Timestamp disimpan sebagai INTEGER milidetik epoch (konsisten, bebas drama timezone).

## Aturan non-fungsional
- Skor memakai pembulatan deterministik; tidak ada angka acak di sisi server selain PIN.
- Jawaban benar tidak pernah dikirim ke klien sebelum ronde dikunci.
- Build `npm run build` harus lolos; endpoint kunci dites via curl (sukses + error).
- Seed: 1 kuis contoh PIN `123456`, 5 soal pengetahuan umum.

## Di luar cakupan
WebSocket dua arah, multi-instance scaling, autentikasi host (PIN host = PIN kuis), upload gambar soal, mode tim.
