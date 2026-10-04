# Kuis Interaktif ala Kahoot

Host membuat kuis (judul + daftar soal) dan mendapat kode PIN unik. Peserta
bergabung dengan PIN + nama, menjawab soal secara sinkron, dan melihat
leaderboard. Realtime memakai **SSE** (Server-Sent Events) + polling HTTP
sebagai fallback — Next.js route handler tidak bisa WebSocket upgrade.

## Cara Menjalankan

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npm run seed   # 1 kuis contoh PIN 123456 (5 soal)
npm run dev
```

## Alur Main

1. Host buka `/`, isi judul + soal, klik "Buat Kuis" → dapat PIN.
2. Host buka `/host/[pin]`, bagikan PIN ke peserta.
3. Peserta buka `/`, masukkan PIN + nama → `/main/[pin]`.
4. Host klik "Mulai" pada soal → soal tampil di semua peserta (SSE) + timer.
5. Peserta menjawab; makin cepat & benar makin tinggi skor (1000→500, salah=0).
6. Timer habis → host kunci jawaban → leaderboard soal + leaderboard total.

## API

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/quizzes` | Buat kuis → `{ pin }` |
| GET | `/api/quizzes/[pin]` | Detail kuis |
| POST | `/api/quizzes/[pin]/join` | Gabung `{ name }` (409 bila nama dipakai) |
| GET | `/api/quizzes/[pin]/state?name=` | State penuh (polling/rejoin) |
| POST | `/api/quizzes/[pin]/questions/[qid]/start` | Host mulai soal |
| POST | `/api/quizzes/[pin]/rounds/lock` | Host kunci jawaban |
| POST | `/api/quizzes/[pin]/finish` | Host akhiri kuis |
| POST | `/api/quizzes/[pin]/rounds/answer` | Jawab `{ name, selectedIndex }` |
| GET | `/api/quizzes/[pin]/leaderboard` | Leaderboard |
| GET | `/api/quizzes/[pin]/events` | SSE event stream |

Contoh SSE via curl:

```bash
curl -N http://localhost:3000/api/quizzes/123456/events
```

Detail spesifikasi: lihat `PRD.md`.
