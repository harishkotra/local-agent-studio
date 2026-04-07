import { listRunEvents } from "@/lib/db";
import { subscribeToRun } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const historical = listRunEvents(runId);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(new TextEncoder().encode(encodeEvent({ type: "ready" })));
      for (const event of historical) {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      }

      const unsubscribe = subscribeToRun(runId, (event) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 10000);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          return;
        }
      };

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      return undefined;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
