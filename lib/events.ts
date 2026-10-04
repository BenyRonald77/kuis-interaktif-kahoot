// Hub SSE in-process: satu instance Node. Publish/broadcast event per PIN.
// Keterbatasan jujur: deploy multi-instance butuh broker eksternal (di luar PRD).

type Listener = (payload: string) => void;

const hubs = new Map<string, Set<Listener>>();

export function subscribe(pin: string, listener: Listener): () => void {
  let set = hubs.get(pin);
  if (!set) {
    set = new Set();
    hubs.set(pin, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) hubs.delete(pin);
  };
}

export function publish(pin: string, event: string, data: unknown): void {
  const set = hubs.get(pin);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const listener of set) {
    try {
      listener(payload);
    } catch {
      /* abaikan listener rusak */
    }
  }
}

export function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
