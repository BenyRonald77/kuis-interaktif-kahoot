import { prisma } from "@/lib/prisma";
import { subscribe, sseHeaders } from "@/lib/events";

export const dynamic = "force-dynamic";

// GET /api/quizzes/[pin]/events — SSE event stream (broadcast server→klien)
export async function GET(
  _req: Request,
  { params }: { params: { pin: string } }
) {
  const quiz = await prisma.quiz.findUnique({ where: { pin: params.pin } });
  if (!quiz) {
    return new Response(JSON.stringify({ error: "kuis tidak ditemukan" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let unsubscribe: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          /* klien terputus */
        }
      };
      unsubscribe = subscribe(params.pin, send);
      // Komentar keep-alive agar koneksi tidak idle-timeout
      send(`: connected pin=${params.pin}\n\n`);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
